"""Graph nodes. Each takes the state and returns a partial update."""

from __future__ import annotations

from datetime import datetime

from .. import config, db, retrieval, sql_guard
from ..llm.classify import classify_query
from ..llm.sql import generate_sql, _summary_sql
from ..llm.synthesize import synthesize_answer

_AGG_FIELDS = [
    ("total_calories", "calories"), ("total_protein_g", "protein_g"),
    ("total_carbs_g", "carbs_g"), ("total_fat_g", "fat_g"),
    ("total_fiber_g", "fiber_g"), ("total_sugar_g", "sugar_g"),
    ("total_sodium_mg", "sodium_mg"),
]


def classify_node(state: dict) -> dict:
    plan = classify_query(state["question"], state.get("now") or datetime.now())
    return {"plan": plan, "route": plan["route"]}


def sql_node(state: dict) -> dict:
    plan, question, uid = state["plan"], state["question"], state["user_id"]
    raw_sql, source = generate_sql(question, plan)
    try:
        safe = sql_guard.validate_and_limit(raw_sql)
        rows = db.run_readonly_sql(safe, uid)
    except Exception:
        # robustness (not the deferred LLM self-correction): fall back to the
        # deterministic summary template so aggregate answers still work.
        safe = sql_guard.validate_and_limit(_summary_sql(plan))
        rows = db.run_readonly_sql(safe, uid)
        source = "template-fallback"

    tf = plan["timeframe"]
    meals = retrieval.recent_meals(uid, tf.get("start"), tf.get("end"))
    note = (
        f"Classified AGGREGATE. Text-to-SQL ({source}) over normalized rows, "
        f"validated (sqlglot AST + forced LIMIT) and executed on the read-only role."
    )
    return {"sql": safe, "sql_source": source, "data": rows[0] if rows else {}, "meals": meals, "router_note": note}


# generic (non-content) tokens that shouldn't drive a lexical match
_GENERIC = {
    "meal", "meals", "protein", "calorie", "calories", "carbs", "carb", "fat",
    "fiber", "sodium", "sugar", "week", "day", "days", "today", "yesterday",
    "much", "many", "often", "eat", "ate", "food", "have", "logged",
}


def _content_terms(keywords: list[str]) -> list[str]:
    return [k for k in (keywords or []) if k not in _GENERIC and len(k) > 3]


def semantic_node(state: dict) -> dict:
    plan, question, uid = state["plan"], state["question"], state["user_id"]
    loc = plan["filters"].get("location")
    hits = retrieval.semantic_search(question, uid, location=loc)[:8]
    note = (
        f"Classified SEMANTIC. Hybrid pgvector (dense) + Postgres full-text (sparse) "
        f"fused with RRF (k={config.RRF_K}) on the read-only role."
    )
    data = {"matches": len(hits), "keywords": plan["filters"].get("keywords")}
    return {"meals": hits, "data": data, "router_note": note}


def hybrid_node(state: dict) -> dict:
    plan, question, uid = state["plan"], state["question"], state["user_id"]
    tf, loc = plan["timeframe"], plan["filters"].get("location")
    hits = retrieval.semantic_search(question, uid, tf.get("start"), tf.get("end"), loc)
    # decomposition: keep only meals that actually match the content term(s),
    # so a hybrid aggregate ("protein from chicken meals") sums the right meals.
    terms = _content_terms(plan["filters"].get("keywords"))
    if terms:
        hits = [h for h in hits if any(t in (h.get("description") or "").lower() for t in terms)]
    data = _aggregate(hits)
    data["matches"] = len(hits)
    note = (
        "Classified HYBRID. Query decomposition: semantic filter (pgvector + FTS, RRF) "
        "within the resolved timeframe, then aggregated over the matched meals."
    )
    return {"meals": hits, "data": data, "router_note": note}


def synthesize_node(state: dict) -> dict:
    answer = synthesize_answer(
        state["question"], state["route"], state["plan"], state.get("data", {}), state.get("meals", [])
    )
    return {"answer": answer}


def _aggregate(meals: list[dict]) -> dict:
    out = {"meals": len(meals), "days": len({m["eaten_at"].date() for m in meals if m.get("eaten_at")})}
    for total_key, _ in _AGG_FIELDS:
        s = sum(float(m.get(total_key, 0) or 0) for m in meals)
        out[total_key] = int(round(s)) if total_key == "total_calories" else round(s, 1)
    return out
