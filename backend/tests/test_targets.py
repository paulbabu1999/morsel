"""Deterministic target fallback (Mifflin-St Jeor + guidelines) is sane."""

from app.llm.targets import _recommend_formula


def test_cutting_male():
    t = _recommend_formula(
        {"age": 29, "sex": "male", "height_cm": 178, "weight_kg": 75,
         "activity_level": "moderate", "goal_type": "lose"}
    )
    assert 1200 <= t["daily_calorie_target"] < t["tdee_estimate"]      # deficit
    assert 130 <= t["protein_target_g"] <= 140                          # ~1.8 g/kg
    assert t["fiber_target_g"] > 0
    assert t["sodium_limit_mg"] == 2300


def test_gaining_adds_surplus():
    base = _recommend_formula({"weight_kg": 70, "goal_type": "maintain"})
    gain = _recommend_formula({"weight_kg": 70, "goal_type": "gain"})
    assert gain["daily_calorie_target"] > base["daily_calorie_target"]


def test_floor_never_below_1200():
    t = _recommend_formula(
        {"age": 70, "sex": "female", "height_cm": 150, "weight_kg": 45,
         "activity_level": "sedentary", "goal_type": "lose"}
    )
    assert t["daily_calorie_target"] >= 1200
