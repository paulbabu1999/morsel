"""A small food catalog + locations used to generate realistic sample data and
to back the stubbed extractor. Macros are per one `unit` (rough real-world
estimates — good enough for a demo).

Designed so the marquee semantic queries from the project spec actually work:
  - "the mushroom dish" -> mushroom risotto / mushroom stir fry
  - "that Thai place near the office" -> Bangkok Corner (location)
  - "the meal I had near the office" -> office-area restaurants
"""

from __future__ import annotations

# name, unit, calories, protein_g, carbs_g, fat_g, tags, typical meal types
FOODS: list[dict] = [
    # breakfast
    {"name": "Scrambled Eggs", "unit": "2 eggs", "cal": 180, "p": 12, "c": 2, "f": 13,
     "tags": ["egg", "high-protein"], "meals": ["breakfast"]},
    {"name": "Greek Yogurt with Berries", "unit": "bowl", "cal": 220, "p": 18, "c": 24, "f": 5,
     "tags": ["yogurt", "berries", "high-protein"], "meals": ["breakfast", "snack"]},
    {"name": "Avocado Toast", "unit": "2 slices", "cal": 330, "p": 9, "c": 34, "f": 18,
     "tags": ["avocado", "toast", "vegetarian"], "meals": ["breakfast"]},
    {"name": "Oatmeal with Banana", "unit": "bowl", "cal": 290, "p": 8, "c": 54, "f": 6,
     "tags": ["oats", "banana", "vegetarian"], "meals": ["breakfast"]},
    {"name": "Protein Smoothie", "unit": "16 oz", "cal": 260, "p": 30, "c": 28, "f": 4,
     "tags": ["smoothie", "protein", "high-protein"], "meals": ["breakfast", "snack"]},
    {"name": "Blueberry Pancakes", "unit": "3 pancakes", "cal": 450, "p": 10, "c": 72, "f": 14,
     "tags": ["pancakes", "blueberry", "sweet"], "meals": ["breakfast"]},

    # lunch / dinner mains
    {"name": "Chicken Burrito", "unit": "burrito", "cal": 640, "p": 38, "c": 68, "f": 22,
     "tags": ["chicken", "burrito", "mexican"], "meals": ["lunch", "dinner"]},
    {"name": "Chicken Rice Bowl", "unit": "bowl", "cal": 560, "p": 42, "c": 60, "f": 14,
     "tags": ["chicken", "rice", "bowl", "high-protein"], "meals": ["lunch", "dinner"]},
    {"name": "Mushroom Risotto", "unit": "plate", "cal": 520, "p": 14, "c": 66, "f": 20,
     "tags": ["mushroom", "risotto", "italian", "vegetarian"], "meals": ["dinner"]},
    {"name": "Mushroom Stir Fry", "unit": "plate", "cal": 380, "p": 16, "c": 40, "f": 16,
     "tags": ["mushroom", "stir-fry", "vegetarian", "asian"], "meals": ["lunch", "dinner"]},
    {"name": "Pad Thai", "unit": "plate", "cal": 600, "p": 22, "c": 80, "f": 20,
     "tags": ["noodles", "thai", "peanut", "shrimp"], "meals": ["lunch", "dinner"]},
    {"name": "Green Curry with Rice", "unit": "plate", "cal": 580, "p": 24, "c": 62, "f": 24,
     "tags": ["curry", "thai", "coconut", "rice"], "meals": ["dinner"]},
    {"name": "Margherita Pizza", "unit": "3 slices", "cal": 720, "p": 28, "c": 84, "f": 28,
     "tags": ["pizza", "italian", "cheese", "vegetarian"], "meals": ["dinner"]},
    {"name": "Salmon with Quinoa", "unit": "plate", "cal": 540, "p": 40, "c": 38, "f": 24,
     "tags": ["salmon", "fish", "quinoa", "high-protein"], "meals": ["dinner"]},
    {"name": "Beef Tacos", "unit": "3 tacos", "cal": 560, "p": 30, "c": 46, "f": 26,
     "tags": ["beef", "tacos", "mexican"], "meals": ["lunch", "dinner"]},
    {"name": "Caesar Salad with Chicken", "unit": "bowl", "cal": 420, "p": 34, "c": 16, "f": 26,
     "tags": ["salad", "chicken", "caesar", "high-protein"], "meals": ["lunch"]},
    {"name": "Turkey Sandwich", "unit": "sandwich", "cal": 480, "p": 32, "c": 44, "f": 18,
     "tags": ["turkey", "sandwich", "deli"], "meals": ["lunch"]},
    {"name": "Ramen", "unit": "bowl", "cal": 600, "p": 26, "c": 72, "f": 22,
     "tags": ["ramen", "noodles", "japanese", "pork"], "meals": ["lunch", "dinner"]},
    {"name": "Poke Bowl", "unit": "bowl", "cal": 500, "p": 34, "c": 58, "f": 14,
     "tags": ["poke", "tuna", "rice", "hawaiian", "high-protein"], "meals": ["lunch"]},
    {"name": "Falafel Wrap", "unit": "wrap", "cal": 520, "p": 18, "c": 62, "f": 22,
     "tags": ["falafel", "wrap", "mediterranean", "vegetarian"], "meals": ["lunch"]},

    # snacks / sides / drinks
    {"name": "Iced Coffee", "unit": "16 oz", "cal": 90, "p": 2, "c": 16, "f": 2,
     "tags": ["coffee", "drink", "cold"], "meals": ["breakfast", "snack"]},
    {"name": "Cold Brew", "unit": "16 oz", "cal": 15, "p": 0, "c": 3, "f": 0,
     "tags": ["coffee", "drink", "cold"], "meals": ["breakfast", "snack"]},
    {"name": "Protein Bar", "unit": "bar", "cal": 210, "p": 20, "c": 22, "f": 7,
     "tags": ["bar", "protein", "snack", "high-protein"], "meals": ["snack"]},
    {"name": "Apple", "unit": "apple", "cal": 95, "p": 0, "c": 25, "f": 0,
     "tags": ["fruit", "apple", "snack"], "meals": ["snack"]},
    {"name": "Mixed Nuts", "unit": "handful", "cal": 200, "p": 6, "c": 8, "f": 18,
     "tags": ["nuts", "snack"], "meals": ["snack"]},
    {"name": "Dark Chocolate", "unit": "2 squares", "cal": 120, "p": 2, "c": 12, "f": 8,
     "tags": ["chocolate", "sweet", "snack"], "meals": ["snack"]},
]

FOODS_BY_NAME = {f["name"].lower(): f for f in FOODS}

# Restaurants / locations. `office` flag marks the "near the office" cluster so
# the "meal near the office" semantic query resolves believably.
LOCATIONS: list[dict] = [
    {"name": "Bangkok Corner", "kind": "thai", "office": True, "eat_out": True},
    {"name": "Chipotle (Downtown)", "kind": "mexican", "office": True, "eat_out": True},
    {"name": "Sweetgreen (Financial District)", "kind": "salad", "office": True, "eat_out": True},
    {"name": "Tatte Bakery", "kind": "cafe", "office": True, "eat_out": True},
    {"name": "Blue Bottle Coffee", "kind": "cafe", "office": True, "eat_out": True},
    {"name": "Osteria Nionno", "kind": "italian", "office": False, "eat_out": True},
    {"name": "Ippudo Ramen", "kind": "japanese", "office": False, "eat_out": True},
    {"name": "Home", "kind": "home", "office": False, "eat_out": False},
]

LOCATIONS_BY_NAME = {loc["name"].lower(): loc for loc in LOCATIONS}
EAT_OUT_LOCATIONS = [loc for loc in LOCATIONS if loc["eat_out"]]
OFFICE_LOCATIONS = [loc for loc in LOCATIONS if loc.get("office")]


def foods_for_meal(meal_type: str) -> list[dict]:
    return [f for f in FOODS if meal_type in f["meals"]]
