"""Answer synthesis. Real: Claude composes a concise NL answer from the tool
results. Stub: deterministic templates (iteration-1 style)."""

from __future__ import annotations

from datetime import datetime

from . import client


def synthesize_answer(question: str, route: str, plan: dict, data: dict, meals: list[dict]) -> str:
    real = _synth_real(question, route, plan, data, meals)
    if real:
        return real
    return _synth_stub(question, route, plan, data, meals)


def _synth_real(question, route, plan, data, meals) -> str | None:
    lines = [f"Question: {question}", f"Route: {route}", f"Timeframe: {plan.get('timeframe', {}).get('label')}"]
    if data:
        lines.append(f"Aggregates: {data}")
    if meals:
        lines.append("Meals:")
        for m in meals[:6]:
            lines.append(
                f"- {m.get('description') or m.get('meal_type')} "
                f"({_when(m.get('eaten_at'))}, {m.get('total_calories')} kcal, "
                f"{m.get('total_protein_g')} g protein)"
            )
    system = (
        "You answer questions about the user's food log. Be concise (1-3 sentences), "
        "specific, and factual — cite concrete numbers and meals from the provided "
        "results only. Neutral logging tone, never judgmental about eating."
    )
    return client.call_text(system, "\n".join(lines), max_tokens=250)


def _when(v) -> str:
    if isinstance(v, datetime):
        return v.strftime("%a %b %d")
    return str(v or "")


# --- stub templates -------------------------------------------------------

def _synth_stub(question, route, plan, data, meals) -> str:
    if route == "aggregate":
        return _agg(plan, data)
    if route == "semantic":
        return _sem(meals)
    return _hybrid(plan, data, meals)


def _agg(plan: dict, d: dict) -> str:
    metric = plan.get("metric", "calories")
    label = plan.get("timeframe", {}).get("label", "recently")
    meals = d.get("meals", 0) or 0
    days = max(1, d.get("days", 1) or 1)
    if metric == "protein":
        tot = float(d.get("total_protein_g", 0))
        return f"You logged {tot:g} g of protein over {label} ({round(tot / days, 1):g} g/day across {meals} meals)."
    if metric == "eat_out":
        out = d.get("eat_out_meals", 0) or 0
        rate = round(100 * out / max(1, meals))
        return f"Over {label} you ate out {out} of {meals} meals ({rate}%)."
    if metric in ("carbs", "fat", "fiber", "sugar"):
        tot = float(d.get(f"total_{metric}_g", 0))
        unit = "g"
        return f"You logged {tot:g} {unit} of {metric} over {label} ({round(tot / days, 1):g} {unit}/day)."
    if metric == "sodium":
        tot = float(d.get("total_sodium_mg", 0))
        return f"You logged {tot:g} mg of sodium over {label} ({round(tot / days):g} mg/day)."
    if metric == "count":
        return f"You logged {meals} meals over {label}."
    tot = int(d.get("total_calories", 0) or 0)
    return f"You consumed about {tot:,} calories over {label} (~{round(tot / days):,}/day across {meals} meals)."


def _sem(meals: list[dict]) -> str:
    if not meals:
        return "I couldn't find a meal matching that description in your history."
    top = meals[0]
    when = _when(top.get("eaten_at"))
    loc = top.get("location_text")
    where = f", at {loc}" if loc and loc != "Home" else ""
    what = (top.get("description") or top.get("meal_type", "a meal")).rstrip(".")
    tail = f" Plus {len(meals) - 1} more similar meals." if len(meals) > 1 else ""
    return f"Your closest match is {what}{where} ({when}).{tail}"


def _hybrid(plan: dict, d: dict, meals: list[dict]) -> str:
    label = plan.get("timeframe", {}).get("label", "recently")
    n = d.get("meals", len(meals))
    if not n:
        return f"No meals matching that description in {label}."
    cal = int(d.get("total_calories", 0) or 0)
    prot = float(d.get("total_protein_g", 0) or 0)
    return f"Over {label}, {n} meal(s) match that description — about {cal:,} calories and {prot:g} g protein in total."
