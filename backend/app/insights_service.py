"""Insights / advice engine.

Turns the user's recent history + targets into a few actionable, **neutral**
suggestions (logging + recall, never a judgmental calorie coach). Two layers:

  1. deterministic rules over stats + per-food SQL aggregates (always available)
  2. an optional LLM-written headline that summarizes the findings in a friendly
     sentence (falls back to a template when no provider is configured)

Insight kinds: calorie | nutrient_low | nutrient_high | swap | pattern.
"""

from __future__ import annotations

from . import config, db, stats_service
from .llm import client
from .nutrition.seed_foods import seed_food_entities

# nutrient field -> human label used in suggestions
_NUTRIENT_LABEL = {
    "fiber_g": "fiber", "iron_mg": "iron", "calcium_mg": "calcium",
    "potassium_mg": "potassium", "protein_g": "protein",
    "sodium_mg": "sodium", "satfat_g": "saturated fat", "sugar_g": "sugar",
}
# adequacy nutrient key -> the per-100g column on food_entities / meal_items
_NUTRIENT_COL = {
    "fiber_g": "fiber_g", "iron_mg": "iron_mg", "calcium_mg": "calcium_mg",
    "potassium_mg": "potassium_mg", "protein_g": "protein_g",
    "sodium_mg": "sodium_mg", "satfat_g": "satfat_g", "sugar_g": "sugar_g",
}


def _foods_rich_in(nutrient_col: str, n: int = 2) -> list[str]:
    """Catalog foods highest per-100g in a nutrient — data-driven suggestions."""
    foods = seed_food_entities()
    ranked = sorted(foods, key=lambda f: f.get(nutrient_col, 0), reverse=True)
    return [f["canonical_name"] for f in ranked[:n]]


def _top_contributors(nutrient_col: str, start, end, user_id: str, n: int = 2) -> list[dict]:
    """User's biggest sources of a nutrient over the window (from meal_items)."""
    sql = f"""
        SELECT canonical_name AS name, round(sum({nutrient_col})::numeric, 0) AS total
        FROM meal_items
        WHERE meal_id IN (SELECT id FROM meals WHERE eaten_at >= %(s)s AND eaten_at <= %(e)s)
        GROUP BY canonical_name
        HAVING sum({nutrient_col}) > 0
        ORDER BY total DESC
        LIMIT %(n)s
    """
    return db.run_readonly_sql(sql, user_id, {"s": start, "e": end, "n": n})


def compute_insights(
    period: str = "week",
    user_id: str = config.DEFAULT_USER_ID,
    tz_offset_min: int = 0,
) -> dict:
    stats = stats_service.compute_stats(period, user_id, tz_offset_min)
    insights: list[dict] = []

    if not stats["total_meals"]:
        return {"period": period, "headline": "No meals logged yet in this window.", "insights": []}

    # stats start/end are LOCAL dates; shift back to the server/UTC frame (where
    # eaten_at lives) so the top-contributor SQL matches the same window.
    from datetime import timedelta
    tz = timedelta(minutes=tz_offset_min)
    start = _period_start(stats) + tz
    end = _period_end(stats) + tz
    targets = stats.get("targets")
    label = {"day": "today", "week": "this week", "month": "this month"}.get(period, "recently")

    # 1. calories vs goal
    if targets and targets.get("daily_calorie_target"):
        avg = round(stats["avg_calories_per_day"])
        goal = targets["daily_calorie_target"]
        diff = avg - goal
        if abs(diff) <= 100:
            insights.append(_ins("calorie", "info",
                "On track with calories",
                f"You're averaging {avg:,} kcal/day {label} — right around your {goal:,} goal."))
        elif diff > 0:
            insights.append(_ins("calorie", "info",
                "A little above your goal",
                f"Running about {avg:,} kcal/day {label} vs a {goal:,} goal — small trims "
                f"(a lighter snack, one less coffee) close most of that gap."))
        else:
            insights.append(_ins("calorie", "info",
                f"~{abs(diff):,} kcal/day under goal",
                f"Averaging {avg:,} kcal/day {label} vs your {goal:,} target — room to spare."))

    # 2. nutrient gaps (targets you're low on) + a food suggestion
    for a in stats.get("adequacy", []):
        if a["kind"] == "target" and a["status"] == "low" and a.get("pct") is not None:
            foods = _foods_rich_in(_NUTRIENT_COL.get(a["nutrient"], a["nutrient"]))
            suggestion = f" Foods high in it: {', '.join(foods)}." if foods else ""
            insights.append(_ins("nutrient_low", "suggest",
                f"Low on {a['label'].lower()}",
                f"About {round(a['pct'])}% of your {a['label'].lower()} target {label} "
                f"({a['amount']:g}/{a['target']:g} {a['unit']}/day).{suggestion}"))

    # 3. limits you're exceeding (e.g. sodium) + biggest sources
    for a in stats.get("adequacy", []):
        if a["kind"] == "limit" and a["status"] == "over" and a.get("target"):
            contrib = _top_contributors(_NUTRIENT_COL.get(a["nutrient"], a["nutrient"]), start, end, user_id)
            names = ", ".join(c["name"] for c in contrib)
            src = f" Biggest sources: {names}." if names else ""
            insights.append(_ins("nutrient_high", "watch",
                f"{a['label']} over the limit",
                f"Averaging {a['amount']:g} {a['unit']}/day vs a {a['target']:g} limit {label}.{src}"))

    # 4. biggest calorie source -> a neutral swap idea
    top_cal = _top_contributors("calories", start, end, user_id, n=1)
    if top_cal:
        t = top_cal[0]
        insights.append(_ins("swap", "suggest",
            "Biggest calorie source",
            f"{t['name']} added about {int(t['total']):,} kcal {label}. "
            f"A lighter portion or swap here frees the most room toward your goal."))

    # 5. eating-out pattern
    if stats["eat_out_rate"] >= 0.4:
        insights.append(_ins("pattern", "info",
            "Eating out often",
            f"You ate out {stats['eat_out_meals']} of {stats['total_meals']} meals "
            f"({round(stats['eat_out_rate']*100)}%) {label}."))

    headline = _headline(insights, label)
    return {"period": period, "headline": headline, "insights": insights[:6]}


def _ins(kind: str, severity: str, title: str, detail: str) -> dict:
    return {"kind": kind, "severity": severity, "title": title, "detail": detail}


def _headline(insights: list[dict], label: str) -> str:
    if not insights:
        return f"Nothing notable {label} — steady logging."
    real = _llm_headline(insights, label)
    if real:
        return real
    watch = [i for i in insights if i["severity"] == "watch"]
    if watch:
        return watch[0]["title"] + "."
    return insights[0]["title"] + "."


def _llm_headline(insights: list[dict], label: str) -> str | None:
    findings = "; ".join(f"{i['title']}: {i['detail']}" for i in insights)
    system = (
        "You write ONE warm, forward-looking sentence for someone tracking their "
        "food — a gentle nudge, not a verdict. Lead with something that's going well, "
        "then at most one small, specific, optional suggestion drawn from their own "
        "data. Never shame, never scold, never mention 'over/under' as a failure. "
        "Talk like a kind friend, not a coach. No emojis. Under 30 words."
    )
    return client.call_text(system, f"Findings for {label}: {findings}\nWrite the one-sentence summary.")


def _period_start(stats: dict):
    from datetime import datetime
    return datetime.fromisoformat(stats["start"] + "T00:00:00")


def _period_end(stats: dict):
    from datetime import datetime
    return datetime.fromisoformat(stats["end"] + "T23:59:59")
