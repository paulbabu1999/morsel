"""Profile -> daily calorie goal + personalized nutrient targets.

Real path: one Claude tool call reasons over the profile. Fallback: Mifflin-St
Jeor BMR x activity factor for calories, then evidence-based per-nutrient targets
scaled to the person and calorie level.
"""

from __future__ import annotations

from . import client

_ACTIVITY_FACTORS = {
    "sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9,
}

_TARGET_SCHEMA = {
    "type": "object",
    "properties": {
        "daily_calorie_target": {"type": "integer"},
        "tdee_estimate": {"type": "integer"},
        "protein_target_g": {"type": "number"},
        "carb_target_g": {"type": "number"},
        "fat_target_g": {"type": "number"},
        "fiber_target_g": {"type": "number"},
        "sugar_limit_g": {"type": "number"},
        "sodium_limit_mg": {"type": "number"},
        "satfat_limit_g": {"type": "number"},
        "iron_target_mg": {"type": "number"},
        "calcium_target_mg": {"type": "number"},
        "potassium_target_mg": {"type": "number"},
        "rationale": {"type": "string"},
    },
    "required": [
        "daily_calorie_target", "tdee_estimate", "protein_target_g", "carb_target_g",
        "fat_target_g", "fiber_target_g", "sugar_limit_g", "sodium_limit_mg",
        "satfat_limit_g", "iron_target_mg", "calcium_target_mg", "potassium_target_mg",
        "rationale",
    ],
}

_SYSTEM = (
    "You are a registered-dietitian-style assistant. Given a person's profile, "
    "recommend a sensible daily calorie target and personalized nutrient targets. "
    "Base calories on Mifflin-St Jeor TDEE adjusted for their goal (roughly -500 kcal "
    "to lose, +300-400 to gain), never below 1200. Protein ~1.6-2.0 g/kg. Fiber ~14 g "
    "per 1000 kcal. Keep sodium <=2300 mg, added sugar and saturated fat modest. "
    "Set iron/calcium/potassium to standard adult reference intakes adjusted for sex. "
    "Keep the rationale to 2-3 plain sentences."
)


def recommend_targets(profile: dict) -> dict:
    real = _recommend_real(profile)
    if real:
        real["target_source"] = "llm"
        return real
    result = _recommend_formula(profile)
    result["target_source"] = "formula"
    return result


def _recommend_real(profile: dict) -> dict | None:
    prompt = (
        "Profile:\n"
        f"- age: {profile.get('age')}\n- sex: {profile.get('sex')}\n"
        f"- height_cm: {profile.get('height_cm')}\n- weight_kg: {profile.get('weight_kg')}\n"
        f"- activity_level: {profile.get('activity_level')}\n"
        f"- goal_type: {profile.get('goal_type')}\n- goal_rate: {profile.get('goal_rate')}\n"
        "Return the target values."
    )
    return client.call_tool(_SYSTEM, prompt, "set_targets", _TARGET_SCHEMA, max_tokens=800)


def _bmr(profile: dict) -> float:
    age = profile.get("age") or 30
    kg = profile.get("weight_kg") or 70
    cm = profile.get("height_cm") or 170
    base = 10 * kg + 6.25 * cm - 5 * age
    sex = (profile.get("sex") or "").lower()
    if sex == "male":
        return base + 5
    if sex == "female":
        return base - 161
    return base - 78  # midpoint for other/unspecified


def _recommend_formula(profile: dict) -> dict:
    kg = profile.get("weight_kg") or 70
    sex = (profile.get("sex") or "").lower()
    goal = (profile.get("goal_type") or "maintain").lower()

    tdee = _bmr(profile) * _ACTIVITY_FACTORS.get(profile.get("activity_level"), 1.375)
    calories = tdee + {"lose": -500, "gain": 400}.get(goal, 0)
    calories = max(1200, round(calories))

    protein = round((1.8 if goal == "lose" else 1.6) * kg)
    fat = round(calories * 0.25 / 9)
    carbs = max(0, round((calories - protein * 4 - fat * 9) / 4))

    return {
        "daily_calorie_target": int(calories),
        "tdee_estimate": int(round(tdee)),
        "protein_target_g": float(protein),
        "carb_target_g": float(carbs),
        "fat_target_g": float(fat),
        "fiber_target_g": round(calories / 1000 * 14, 1),
        "sugar_limit_g": round(calories * 0.10 / 4, 1),
        "sodium_limit_mg": 2300.0,
        "satfat_limit_g": round(calories * 0.10 / 9, 1),
        "iron_target_mg": 18.0 if sex == "female" else 8.0,
        "calcium_target_mg": 1000.0,
        "potassium_target_mg": 2600.0 if sex == "female" else 3400.0,
        "rationale": (
            f"Estimated TDEE ~{round(tdee)} kcal via Mifflin-St Jeor x activity, "
            f"adjusted for your goal to {calories} kcal/day. Protein set to "
            f"{'1.8' if goal == 'lose' else '1.6'} g/kg; fiber, sodium, sugar and "
            "saturated-fat targets follow standard adult guidelines."
        ),
    }
