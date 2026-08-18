"""Dashboard stats + nutrient adequacy vs. the user's personalized targets."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from . import config, db, repo

_PERIOD_DAYS = {"day": 1, "week": 7, "month": 30}

# nutrient -> (label, unit, per-day total field, profile target field, kind)
_ADEQUACY = [
    ("protein_g", "Protein", "g", "total_protein_g", "protein_target_g", "target"),
    ("fiber_g", "Fiber", "g", "total_fiber_g", "fiber_target_g", "target"),
    ("iron_mg", "Iron", "mg", "total_iron_mg", "iron_target_mg", "target"),
    ("calcium_mg", "Calcium", "mg", "total_calcium_mg", "calcium_target_mg", "target"),
    ("potassium_mg", "Potassium", "mg", "total_potassium_mg", "potassium_target_mg", "target"),
    ("sodium_mg", "Sodium", "mg", "total_sodium_mg", "sodium_limit_mg", "limit"),
    ("satfat_g", "Saturated fat", "g", "total_satfat_g", "satfat_limit_g", "limit"),
    ("sugar_g", "Sugar", "g", "total_sugar_g", "sugar_limit_g", "limit"),
]


def _status(pct: float | None, kind: str) -> str:
    if pct is None:
        return "unknown"
    if kind == "limit":
        return "over" if pct > 100 else "high" if pct > 80 else "ok"
    return "low" if pct < 80 else "high" if pct > 150 else "ok"


def compute_stats(
    period: str = "week",
    user_id: str = config.DEFAULT_USER_ID,
    tz_offset_min: int = 0,
) -> dict:
    days = _PERIOD_DAYS.get(period, 7)
    # Day boundaries are computed in the USER's local timezone, not the server's.
    # `eaten_at` is stored in the server clock (UTC on the hosted box); `tz_offset_min`
    # is the browser's Date.getTimezoneOffset() (minutes; UTC = local + offset, so
    # e.g. US-Eastern = 240). We build the window in local time, shift it back to UTC
    # to query eaten_at, and bucket/count by local calendar date. Default 0 == UTC
    # (back-compat) — without this, an evening meal logged in a west-of-UTC zone lands
    # on the previous UTC day and vanishes from "Today" once UTC ticks past midnight.
    tz = timedelta(minutes=tz_offset_min)
    now = datetime.now()                 # server clock (UTC on Render)
    now_local = now - tz                 # user's local wall clock
    day0_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    start_local = day0_local - timedelta(days=days - 1)
    start = start_local + tz             # back to the server/UTC frame for querying

    meals = repo.list_meals(user_id, start=start, end=now, limit=1000)
    profile = repo.get_profile(user_id)

    def _local_date(dt):
        return (dt - tz).date()

    # Per-day averages divide by the number of days actually LOGGED in the window,
    # not the raw window length. Otherwise a new user's week/month averages are
    # deflated by empty days (e.g. on day 1, dividing by 7 or 30 makes "avg/day"
    # a fraction of the real intake). With this, day/week/month all read the same
    # on day 1, then diverge only as more days get logged.
    logged_days = max(1, len({_local_date(m["eaten_at"]) for m in meals}))

    # daily buckets keyed by the user's LOCAL calendar date
    buckets: dict[str, list] = {(start_local + timedelta(days=i)).date().isoformat(): [] for i in range(days)}
    for m in meals:
        buckets.setdefault(_local_date(m["eaten_at"]).isoformat(), []).append(m)
    by_day = [
        {
            "date": d,
            "calories": sum(x["total_calories"] for x in ms),
            "protein_g": round(sum(x["total_protein_g"] for x in ms), 1),
            "carbs_g": round(sum(x["total_carbs_g"] for x in ms), 1),
            "fat_g": round(sum(x["total_fat_g"] for x in ms), 1),
            "meals": len(ms),
        }
        for d, ms in sorted(buckets.items())
    ]

    total_cal = sum(m["total_calories"] for m in meals)
    total_protein = round(sum(m["total_protein_g"] for m in meals), 1)
    eat_out = [m for m in meals if "eating-out" in (m.get("tags") or [])]

    # adequacy: compare per-day average intake to the daily target
    adequacy = []
    for nutrient, label, unit, total_field, target_field, kind in _ADEQUACY:
        per_day = round(sum(m[total_field] for m in meals) / logged_days, 1)
        target = (profile or {}).get(target_field)
        pct = round(100 * per_day / target, 0) if target else None
        adequacy.append({
            "nutrient": nutrient, "label": label, "unit": unit, "amount": per_day,
            "target": target, "pct": pct, "status": _status(pct, kind), "kind": kind,
        })

    # top foods over the window
    top = db.run_readonly_sql(
        """SELECT canonical_name AS name, count(*) AS count
           FROM meal_items
           WHERE meal_id IN (SELECT id FROM meals WHERE eaten_at >= %(s)s AND eaten_at <= %(e)s)
           GROUP BY canonical_name ORDER BY count DESC LIMIT 6""",
        user_id, {"s": start, "e": now},
    )

    meal_type_counts = Counter(m["meal_type"] for m in meals)
    return {
        "period": period,
        "start": start_local.date().isoformat(),
        "end": now_local.date().isoformat(),
        "total_meals": len(meals),
        "total_calories": total_cal,
        "days_tracked": logged_days,
        "avg_calories_per_day": round(total_cal / logged_days, 1),
        "avg_protein_per_day": round(total_protein / logged_days, 1),
        "eat_out_meals": len(eat_out),
        "eat_out_rate": round(len(eat_out) / max(1, len(meals)), 2),
        "targets": profile,
        "adequacy": adequacy,
        "by_day": by_day,
        "top_foods": top,
        "by_meal_type": dict(meal_type_counts),
    }
