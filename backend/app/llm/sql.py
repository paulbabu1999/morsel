"""Text-to-SQL for the aggregate path.

Real: Claude generates a single SELECT grounded on the schema doc, with the
timeframe already resolved to explicit bounds by the classifier. Stub: a
deterministic timeframe-summary query covering all common metrics.

Every query — real or stub — then passes through sql_guard (AST validation +
forced LIMIT) and executes on the read-only role. Dates are our own normalized
values (not user text), so inlining them is safe.
"""

from __future__ import annotations

from datetime import datetime

from . import client

SCHEMA_DOC = """
Tables (Postgres). Nutrient totals on `meals` are absolute for the meal.

meals(
  id text, user_id text, eaten_at timestamptz, meal_type text
    -- meal_type in ('breakfast','lunch','dinner','snack'),
  location_text text, description text, tags text[],  -- 'eating-out' tag marks restaurant meals
  total_calories int, total_protein_g real, total_carbs_g real, total_fat_g real,
  total_fiber_g real, total_sugar_g real, total_sodium_mg real, total_satfat_g real,
  total_iron_mg real, total_calcium_mg real, total_potassium_mg real
)
meal_items(
  id text, meal_id text -> meals.id, canonical_name text, quantity real, unit text, grams real,
  calories int, protein_g real, carbs_g real, fat_g real, fiber_g real, sugar_g real,
  sodium_mg real, satfat_g real, iron_mg real, calcium_mg real, potassium_mg real
)

Row-Level Security already scopes every row to the current user; do NOT add a
user_id filter. Use `meal_items` (join on meal_id) when filtering by a specific
food; use `meals` for whole-meal aggregates. Return a small labelled result.
""".strip()

_SQL_SCHEMA = {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]}


def generate_sql(question: str, plan: dict) -> tuple[str, str]:
    """Return (sql, source) where source is 'claude' or 'template'."""
    real = _generate_real(question, plan)
    if real:
        return real, "claude"
    return _summary_sql(plan), "template"


def _generate_real(question: str, plan: dict) -> str | None:
    tf = plan.get("timeframe", {})
    bounds = _bounds_text(tf.get("start"), tf.get("end"))
    system = (
        "You write ONE read-only PostgreSQL SELECT for a food log. "
        + SCHEMA_DOC
        + "\nRules: exactly one SELECT statement; no writes/DDL; alias outputs "
        "clearly; the timeframe is already resolved — apply it verbatim."
    )
    prompt = f"Question: {question}\nTimeframe filter to apply: {bounds or 'none'}\nReturn the SQL."
    out = client.call_tool(system, prompt, "run_sql", _SQL_SCHEMA, max_tokens=600)
    if not out or not out.get("sql"):
        return None
    return out["sql"].strip().rstrip(";")


def _bounds_text(start, end) -> str:
    parts = []
    if start:
        parts.append(f"eaten_at >= '{_fmt(start)}'")
    if end:
        parts.append(f"eaten_at <= '{_fmt(end)}'")
    return " AND ".join(parts)


def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _summary_sql(plan: dict) -> str:
    tf = plan.get("timeframe", {})
    where = _bounds_text(tf.get("start"), tf.get("end"))
    where_clause = f"WHERE {where}" if where else ""
    return f"""
SELECT
  count(*)                                             AS meals,
  count(DISTINCT date(eaten_at))                       AS days,
  coalesce(sum(total_calories), 0)                     AS total_calories,
  round(coalesce(sum(total_protein_g), 0)::numeric, 1) AS total_protein_g,
  round(coalesce(sum(total_carbs_g), 0)::numeric, 1)   AS total_carbs_g,
  round(coalesce(sum(total_fat_g), 0)::numeric, 1)     AS total_fat_g,
  round(coalesce(sum(total_fiber_g), 0)::numeric, 1)   AS total_fiber_g,
  round(coalesce(sum(total_sugar_g), 0)::numeric, 1)   AS total_sugar_g,
  round(coalesce(sum(total_sodium_mg), 0)::numeric, 0) AS total_sodium_mg,
  count(*) FILTER (WHERE 'eating-out' = ANY(tags))     AS eat_out_meals
FROM meals
{where_clause}
""".strip()
