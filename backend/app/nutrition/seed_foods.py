"""Bundled per-100 g nutrition for the demo food catalog.

Used to populate `food_entities` at seed time with ZERO USDA API calls (the
DEMO_KEY rate limit would otherwise choke seeding). Macros are calibrated so
`grams * value / 100` reproduces iteration-1's per-serving calories; micros are
realistic estimates. Novel foods captured at runtime resolve via USDA instead.

Each entry: canonical_name, aliases, default_unit, default_grams (grams in one
unit), and nutrients PER 100 g.
"""

from __future__ import annotations

# fmt: off
# name, aliases, unit, grams, cal, protein, carbs, fat, fiber, sugar, sodium, satfat, iron, calcium, potassium
_ROWS = [
    ("Scrambled Eggs", ["eggs", "scrambled egg"], "2 eggs", 100, 155, 13.0, 1.1, 11.0, 0.0, 1.1, 124, 3.3, 1.8, 56, 138),
    ("Greek Yogurt with Berries", ["greek yogurt", "yogurt", "yogurt with berries"], "bowl", 245, 90, 8.0, 8.0, 2.5, 1.0, 6.0, 35, 1.5, 0.1, 100, 140),
    ("Avocado Toast", ["avocado toast", "toast"], "2 slices", 140, 230, 6.0, 25.0, 12.0, 6.0, 2.0, 330, 2.0, 1.5, 50, 350),
    ("Oatmeal with Banana", ["oatmeal", "oats", "porridge"], "bowl", 260, 110, 3.0, 20.0, 2.0, 2.5, 6.0, 5, 0.4, 1.0, 20, 150),
    ("Protein Smoothie", ["smoothie", "protein shake"], "16 oz", 400, 65, 7.5, 7.0, 1.0, 1.0, 5.0, 40, 0.4, 0.5, 120, 200),
    ("Blueberry Pancakes", ["pancakes", "blueberry pancakes"], "3 pancakes", 200, 230, 5.0, 37.0, 7.0, 1.5, 10.0, 430, 2.0, 1.5, 100, 120),
    ("Chicken Burrito", ["burrito", "chicken burrito"], "burrito", 330, 195, 11.5, 20.6, 6.7, 4.0, 1.5, 500, 2.5, 2.0, 80, 250),
    ("Chicken Rice Bowl", ["chicken rice", "chicken and rice", "rice bowl", "chicken bowl"], "bowl", 375, 150, 11.0, 16.0, 3.8, 1.5, 1.0, 350, 1.0, 1.0, 20, 200),
    ("Mushroom Risotto", ["risotto", "mushroom risotto"], "plate", 400, 130, 3.5, 16.5, 5.0, 1.5, 1.0, 300, 2.5, 0.8, 40, 200),
    ("Mushroom Stir Fry", ["mushroom stir fry", "stir fry", "mushrooms"], "plate", 400, 95, 4.0, 10.0, 4.0, 2.5, 4.0, 450, 0.7, 1.0, 30, 300),
    ("Pad Thai", ["pad thai", "thai noodles"], "plate", 400, 150, 5.5, 20.0, 5.0, 2.0, 8.0, 500, 1.2, 1.2, 40, 180),
    ("Green Curry with Rice", ["green curry", "curry", "thai curry"], "plate", 400, 145, 6.0, 15.5, 6.0, 1.5, 3.0, 450, 3.5, 1.0, 30, 250),
    ("Margherita Pizza", ["pizza", "margherita pizza"], "3 slices", 300, 240, 9.3, 28.0, 9.3, 2.0, 3.0, 560, 4.0, 2.0, 150, 150),
    ("Salmon with Quinoa", ["salmon", "salmon quinoa"], "plate", 350, 155, 11.4, 10.8, 6.8, 2.0, 1.0, 200, 1.4, 1.2, 30, 350),
    ("Beef Tacos", ["tacos", "beef tacos"], "3 tacos", 280, 200, 10.7, 16.4, 9.3, 3.0, 2.0, 400, 3.5, 2.0, 100, 250),
    ("Caesar Salad with Chicken", ["caesar salad", "chicken salad", "salad"], "bowl", 280, 150, 12.0, 5.7, 9.3, 2.0, 2.0, 400, 2.5, 1.0, 80, 250),
    ("Turkey Sandwich", ["turkey sandwich", "sandwich"], "sandwich", 240, 200, 13.3, 18.3, 7.5, 2.5, 4.0, 600, 2.0, 2.0, 100, 200),
    ("Ramen", ["ramen", "noodle soup"], "bowl", 500, 120, 5.2, 14.4, 4.4, 1.5, 2.0, 600, 1.5, 1.5, 30, 150),
    ("Poke Bowl", ["poke", "poke bowl", "tuna bowl"], "bowl", 400, 125, 8.5, 14.5, 3.5, 1.5, 3.0, 450, 0.8, 1.0, 20, 250),
    ("Falafel Wrap", ["falafel", "falafel wrap"], "wrap", 260, 200, 7.0, 24.0, 8.5, 5.0, 3.0, 500, 1.5, 2.5, 60, 300),
    ("Iced Coffee", ["iced coffee", "coffee"], "16 oz", 480, 19, 0.4, 3.4, 0.4, 0.0, 3.0, 10, 0.2, 0.0, 10, 60),
    ("Cold Brew", ["cold brew", "black coffee"], "16 oz", 480, 3, 0.1, 0.6, 0.0, 0.0, 0.0, 5, 0.0, 0.0, 3, 50),
    ("Protein Bar", ["protein bar", "bar"], "bar", 60, 350, 33.0, 37.0, 12.0, 8.0, 12.0, 250, 4.0, 3.0, 150, 200),
    ("Apple", ["apple"], "apple", 180, 52, 0.3, 14.0, 0.2, 2.4, 10.0, 1, 0.0, 0.1, 6, 107),
    ("Mixed Nuts", ["nuts", "mixed nuts", "almonds"], "handful", 30, 600, 20.0, 20.0, 54.0, 8.0, 4.0, 5, 7.0, 3.0, 100, 600),
    ("Dark Chocolate", ["dark chocolate", "chocolate"], "2 squares", 20, 600, 7.8, 46.0, 43.0, 11.0, 24.0, 24, 24.0, 12.0, 73, 715),
]
# fmt: on

_FIELDS = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g",
    "sodium_mg", "satfat_g", "iron_mg", "calcium_mg", "potassium_mg",
]


def seed_food_entities() -> list[dict]:
    out = []
    for name, aliases, unit, grams, *nutrients in _ROWS:
        entry = {
            "canonical_name": name,
            "aliases": aliases,
            "source": "seed",
            "default_unit": unit,
            "default_grams": float(grams),
        }
        entry.update({field: float(val) for field, val in zip(_FIELDS, nutrients)})
        out.append(entry)
    return out
