"""Owner/operator analytics — cross-user aggregates for the admin dashboard.

Every read goes through `db.run_analytics_sql`, which uses the dedicated read-only
BYPASSRLS `morsel_analytics` role (see deploy/neon_setup.sql) so counts/sums span
ALL users. This module holds ONLY hand-written, parameterized SQL — never
LLM-generated SQL and never raw user input beyond validated ints — which is what
keeps that BYPASSRLS role's blast radius bounded.

"Activity" = a meal's `created_at` (when the user actually logged), not `eaten_at`
(which can be backdated). Day boundaries use the operator's `tz_offset` where it
matters, defaulting to UTC (0), consistent with stats_service.
"""

from __future__ import annotations

from datetime import datetime

from . import db


def _one(sql: str, params: dict | None = None) -> dict:
    rows = db.run_analytics_sql(sql, params or {})
    return rows[0] if rows else {}


# --- overview (headline KPIs) ----------------------------------------------

def compute_overview() -> dict:
    row = _one(
        """
        SELECT
          (SELECT count(*) FROM users) AS total_users,
          (SELECT count(*) FROM users WHERE created_at >= now() - interval '1 day')  AS new_users_1d,
          (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days') AS new_users_7d,
          (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days') AS new_users_30d,
          (SELECT count(*) FROM meals) AS total_meals,
          (SELECT count(*) FROM meals WHERE created_at >= date_trunc('day', now())) AS meals_today,
          (SELECT count(*) FROM meals WHERE created_at >= now() - interval '7 days') AS meals_7d,
          (SELECT count(DISTINCT user_id) FROM meals WHERE created_at >= date_trunc('day', now())) AS daily_active_loggers,
          (SELECT count(DISTINCT user_id) FROM meals WHERE created_at >= now() - interval '7 days') AS weekly_active_loggers,
          (SELECT count(DISTINCT user_id) FROM meals WHERE created_at >= now() - interval '30 days') AS monthly_active_loggers,
          (SELECT count(*) FROM events) AS total_events,
          (SELECT count(DISTINCT user_id) FROM events WHERE event = 'app_open' AND ts >= date_trunc('day', now())) AS app_open_dau,
          (SELECT count(DISTINCT user_id) FROM events WHERE event = 'app_open' AND ts >= now() - interval '7 days') AS app_open_wau,
          pg_database_size(current_database()) AS db_size_bytes
        """
    )
    adherent = _one(
        """
        SELECT count(*) AS n FROM (
          SELECT user_id FROM meals
          WHERE created_at >= now() - interval '7 days'
          GROUP BY user_id
          HAVING count(DISTINCT created_at::date) >= 3
        ) t
        """
    )
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "total_users": int(row.get("total_users", 0)),
        "new_users_1d": int(row.get("new_users_1d", 0)),
        "new_users_7d": int(row.get("new_users_7d", 0)),
        "new_users_30d": int(row.get("new_users_30d", 0)),
        "total_meals": int(row.get("total_meals", 0)),
        "meals_today": int(row.get("meals_today", 0)),
        "meals_7d": int(row.get("meals_7d", 0)),
        "weekly_active_loggers": int(row.get("weekly_active_loggers", 0)),
        "daily_active_loggers": int(row.get("daily_active_loggers", 0)),
        "monthly_active_loggers": int(row.get("monthly_active_loggers", 0)),
        "adherent_loggers_7d": int(adherent.get("n", 0)),
        "app_open_dau": int(row.get("app_open_dau", 0)),
        "app_open_wau": int(row.get("app_open_wau", 0)),
        "total_events": int(row.get("total_events", 0)),
        "db_size_mb": round(float(row.get("db_size_bytes", 0)) / 1e6, 1),
    }


# --- growth (time series) --------------------------------------------------

def compute_growth(days: int = 30, tz_offset_min: int = 0) -> dict:
    rows = db.run_analytics_sql(
        """
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', now() - make_interval(mins => %(tz)s)) - make_interval(days => %(days)s - 1),
            date_trunc('day', now() - make_interval(mins => %(tz)s)),
            interval '1 day'
          )::date AS d
        ),
        signups AS (
          SELECT (created_at - make_interval(mins => %(tz)s))::date AS d, count(*) AS n
          FROM users GROUP BY 1
        ),
        logs AS (
          SELECT (created_at - make_interval(mins => %(tz)s))::date AS d,
                 count(*) AS meals, count(DISTINCT user_id) AS active
          FROM meals GROUP BY 1
        )
        SELECT
          days.d::text AS date,
          COALESCE(signups.n, 0) AS signups,
          (SELECT count(*) FROM users
             WHERE (created_at - make_interval(mins => %(tz)s))::date <= days.d) AS cumulative_users,
          COALESCE(logs.active, 0) AS active_loggers,
          COALESCE(logs.meals, 0) AS meals
        FROM days
        LEFT JOIN signups ON signups.d = days.d
        LEFT JOIN logs    ON logs.d = days.d
        ORDER BY days.d
        """,
        {"days": days, "tz": tz_offset_min},
    )
    return {
        "days": days,
        "by_day": [
            {
                "date": r["date"],
                "signups": int(r["signups"]),
                "cumulative_users": int(r["cumulative_users"]),
                "active_loggers": int(r["active_loggers"]),
                "meals": int(r["meals"]),
            }
            for r in rows
        ],
    }


# --- engagement ------------------------------------------------------------

def _counts(sql: str, params: dict, key: str, val: str = "n") -> dict:
    return {str(r[key]): int(r[val]) for r in db.run_analytics_sql(sql, params) if r.get(key) is not None}


def compute_engagement(days: int = 30) -> dict:
    p = {"days": days}
    win = "created_at >= now() - make_interval(days => %(days)s)"
    device_mix = _counts(
        f"SELECT source, count(*) AS n FROM meals WHERE {win} GROUP BY source", p, "source"
    )
    meal_types = _counts(
        f"SELECT meal_type, count(*) AS n FROM meals WHERE {win} GROUP BY meal_type", p, "meal_type"
    )
    event_counts = _counts(
        "SELECT event, count(*) AS n FROM events WHERE ts >= now() - make_interval(days => %(days)s) GROUP BY event",
        p, "event",
    )
    query_routes = _counts(
        "SELECT props->>'route' AS route, count(*) AS n FROM events "
        "WHERE event = 'query_asked' AND ts >= now() - make_interval(days => %(days)s) "
        "AND props ? 'route' GROUP BY 1",
        p, "route",
    )
    qrow = _one(
        "SELECT count(*) AS total, "
        "avg(CASE WHEN props->>'ok' = 'true' THEN 1.0 ELSE 0.0 END) AS ok_rate "
        "FROM events WHERE event = 'query_asked' AND ts >= now() - make_interval(days => %(days)s)",
        p,
    )
    weigh = _one(
        "SELECT count(*) AS n FROM weight_logs WHERE logged_at >= now() - make_interval(days => %(days)s)", p
    )
    wal = _one(
        "SELECT count(DISTINCT user_id) AS n FROM meals WHERE created_at >= now() - interval '7 days'"
    )
    meals_7d = _one("SELECT count(*) AS n FROM meals WHERE created_at >= now() - interval '7 days'")
    wal_n = int(wal.get("n", 0)) or 1
    capture_methods = {k: event_counts.get(k, 0) for k in ("capture_analyze", "quicklog", "capture_refine")}
    return {
        "days": days,
        "device_mix": device_mix,
        "meal_types": meal_types,
        "event_counts": event_counts,
        "capture_methods": capture_methods,
        "edits": event_counts.get("meal_edit", 0),
        "deletes": event_counts.get("meal_delete", 0),
        "refines": event_counts.get("capture_refine", 0),
        "query_volume": int(qrow.get("total", 0)),
        "query_ok_rate": round(float(qrow.get("ok_rate") or 0), 3),
        "query_routes": query_routes,
        "weigh_ins": int(weigh.get("n", 0)),
        "meals_per_active_logger_7d": round(int(meals_7d.get("n", 0)) / wal_n, 2),
    }


# --- retention (weekly cohort grid) ----------------------------------------

def compute_retention(weeks: int = 8) -> dict:
    rows = db.run_analytics_sql(
        """
        WITH cohorts AS (
          SELECT id AS user_id, date_trunc('week', created_at)::date AS cohort_week FROM users
        ),
        activity AS (
          SELECT DISTINCT user_id, date_trunc('week', created_at)::date AS active_week FROM meals
        ),
        offsets AS (SELECT generate_series(0, %(weeks)s) AS k)
        SELECT
          c.cohort_week::text AS cohort_start,
          o.k AS week_offset,
          count(DISTINCT c.user_id) AS size,
          count(DISTINCT a.user_id) AS retained
        FROM cohorts c
        CROSS JOIN offsets o
        LEFT JOIN activity a
          ON a.user_id = c.user_id
         AND a.active_week = (c.cohort_week + make_interval(weeks => o.k::int))::date
        WHERE c.cohort_week >= (date_trunc('week', now()) - make_interval(weeks => %(weeks)s))::date
        GROUP BY c.cohort_week, o.k
        ORDER BY c.cohort_week, o.k
        """,
        {"weeks": weeks},
    )
    by_cohort: dict[str, dict] = {}
    for r in rows:
        c = by_cohort.setdefault(
            r["cohort_start"], {"cohort_start": r["cohort_start"], "size": int(r["size"]), "retained": {}}
        )
        c["retained"][int(r["week_offset"])] = int(r["retained"])
    cohorts = [
        {
            "cohort_start": c["cohort_start"],
            "size": c["size"],
            "retained": [c["retained"].get(k, 0) for k in range(weeks + 1)],
        }
        for c in sorted(by_cohort.values(), key=lambda x: x["cohort_start"])
    ]
    return {"weeks": weeks, "cohorts": cohorts}


# --- outcomes (does it work?) ----------------------------------------------

def _weight_outcomes(days: int) -> dict:
    row = _one(
        """
        WITH w AS (
          SELECT user_id,
                 (array_agg(weight_kg ORDER BY logged_at))[1]      AS first_kg,
                 (array_agg(weight_kg ORDER BY logged_at DESC))[1] AS last_kg
          FROM weight_logs
          WHERE logged_at >= now() - make_interval(days => %(days)s)
          GROUP BY user_id
          HAVING count(*) >= 2
        )
        SELECT
          count(*) AS users,
          avg(w.last_kg - w.first_kg) AS avg_change,
          avg(CASE
                WHEN p.goal_type = 'lose'     AND w.last_kg < w.first_kg THEN 1.0
                WHEN p.goal_type = 'gain'     AND w.last_kg > w.first_kg THEN 1.0
                WHEN p.goal_type = 'maintain' AND abs(w.last_kg - w.first_kg) <= 1.0 THEN 1.0
                ELSE 0.0 END) FILTER (WHERE p.goal_type IS NOT NULL) AS pct_toward_goal
        FROM w LEFT JOIN user_profile p ON p.user_id = w.user_id
        """,
        {"days": days},
    )
    return {
        "users": int(row.get("users", 0)),
        "avg_change_kg": round(float(row.get("avg_change") or 0), 2),
        "pct_toward_goal": round(float(row.get("pct_toward_goal") or 0), 3),
    }


def compute_outcomes() -> dict:
    goal_distribution = _counts(
        "SELECT goal_type, count(*) AS n FROM user_profile WHERE goal_type IS NOT NULL GROUP BY goal_type",
        {}, "goal_type",
    )
    adh = _one(
        """
        WITH daily AS (
          SELECT m.user_id, m.created_at::date AS d,
                 sum(m.total_calories) AS cals, sum(m.total_protein_g) AS protein
          FROM meals m
          WHERE m.created_at >= now() - interval '30 days'
          GROUP BY m.user_id, m.created_at::date
        )
        SELECT
          avg(CASE WHEN daily.cals BETWEEN p.daily_calorie_target * 0.8 AND p.daily_calorie_target * 1.2
                   THEN 1.0 ELSE 0.0 END) FILTER (WHERE p.daily_calorie_target > 0) AS calorie_adherence,
          avg(CASE WHEN daily.protein >= p.protein_target_g * 0.9
                   THEN 1.0 ELSE 0.0 END) FILTER (WHERE p.protein_target_g > 0)   AS protein_adherence,
          count(*) FILTER (WHERE p.daily_calorie_target > 0) AS target_days
        FROM daily JOIN user_profile p ON p.user_id = daily.user_id
        """
    )
    tracking = _one(
        "SELECT count(*) AS n FROM (SELECT user_id FROM weight_logs GROUP BY user_id HAVING count(*) >= 2) t"
    )
    return {
        "goal_distribution": goal_distribution,
        "users_with_goal": sum(goal_distribution.values()),
        "users_tracking_weight": int(tracking.get("n", 0)),
        "weight_30d": _weight_outcomes(30),
        "weight_90d": _weight_outcomes(90),
        "calorie_adherence": round(float(adh.get("calorie_adherence") or 0), 3),
        "protein_adherence": round(float(adh.get("protein_adherence") or 0), 3),
        "adherence_target_days": int(adh.get("target_days", 0)),
    }


# --- system health / data quality ------------------------------------------

def compute_system(days: int = 7) -> dict:
    p = {"days": days}
    events_by_day = [
        {"date": str(r["date"]), "count": int(r["count"])}
        for r in db.run_analytics_sql(
            "SELECT ts::date AS date, count(*) AS count FROM events "
            "WHERE ts >= now() - make_interval(days => %(days)s) GROUP BY 1 ORDER BY 1",
            p,
        )
    ]
    lat = {
        r["event"]: {
            "n": int(r["n"]),
            "p50": round(float(r["p50"]), 0) if r.get("p50") is not None else None,
            "p95": round(float(r["p95"]), 0) if r.get("p95") is not None else None,
        }
        for r in db.run_analytics_sql(
            """
            SELECT event, count(*) AS n,
              percentile_cont(0.5)  WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS p95
            FROM events WHERE ts >= now() - make_interval(days => %(days)s) GROUP BY event
            """,
            p,
        )
    }
    # LLM fallback: capture/query events tag props.llm = 'real' | 'stub'.
    fb = _one(
        "SELECT count(*) FILTER (WHERE props->>'llm' = 'stub') AS stub, "
        "count(*) FILTER (WHERE props ? 'llm') AS total "
        "FROM events WHERE ts >= now() - make_interval(days => %(days)s) "
        "AND event IN ('capture_analyze','quicklog','capture_refine','query_asked')",
        p,
    )
    stub, total = int(fb.get("stub", 0)), int(fb.get("total", 0))
    q = _one(
        "SELECT avg(CASE WHEN props->>'ok' = 'false' THEN 1.0 ELSE 0.0 END) AS empty_rate "
        "FROM events WHERE event = 'query_asked' AND ts >= now() - make_interval(days => %(days)s)",
        p,
    )
    dq = _one(
        """
        SELECT count(*) AS meals,
               avg(confidence) AS avg_confidence,
               avg(CASE WHEN confidence < 0.5 THEN 1.0 ELSE 0.0 END) AS low_conf_rate,
               avg(CASE WHEN total_calories = 0 THEN 1.0 ELSE 0.0 END) AS zero_kcal_rate
        FROM meals WHERE created_at >= now() - make_interval(days => %(days)s)
        """,
        p,
    )
    res = _one(
        "SELECT avg(CASE WHEN food_entity_id IS NOT NULL THEN 1.0 ELSE 0.0 END) AS rate "
        "FROM meal_items WHERE meal_id IN "
        "(SELECT id FROM meals WHERE created_at >= now() - make_interval(days => %(days)s))",
        p,
    )
    catalog = _counts("SELECT source, count(*) AS n FROM food_entities GROUP BY source", {}, "source")
    return {
        "days": days,
        "events_by_day": events_by_day,
        "event_latency_ms": lat,
        "llm_fallback_rate": round(stub / total, 3) if total else 0.0,
        "llm_calls": total,
        "query_empty_rate": round(float(q.get("empty_rate") or 0), 3),
        "avg_meal_confidence": round(float(dq.get("avg_confidence") or 0), 3),
        "low_confidence_meal_rate": round(float(dq.get("low_conf_rate") or 0), 3),
        "zero_kcal_meal_rate": round(float(dq.get("zero_kcal_rate") or 0), 3),
        "entity_resolution_rate": round(float(res.get("rate") or 0), 3),
        "catalog_composition": catalog,
    }
