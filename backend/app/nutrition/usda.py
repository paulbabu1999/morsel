"""USDA FoodData Central client — resolves a food name to per-100 g nutrition.

Used at runtime for foods NOT already in `food_entities` (novel captures). The
result is cached into `food_entities`, so each food hits the API at most once.
Free API key via USDA_API_KEY (DEMO_KEY for dev, low rate limit).

FDC nutrient values for Foundation/SR Legacy/Survey data types are per 100 g,
which matches our storage convention.
"""

from __future__ import annotations

import httpx

from .. import config

# FDC nutrient id -> our per-100g field. Multiple ids map to one field where the
# dataset uses variants (e.g. total sugars).
_NUTRIENT_MAP: dict[int, str] = {
    1008: "calories",     # Energy (kcal)
    1003: "protein_g",
    1005: "carbs_g",      # Carbohydrate, by difference
    1004: "fat_g",        # Total lipid (fat)
    1079: "fiber_g",      # Fiber, total dietary
    2000: "sugar_g",      # Sugars, total including NLEA
    1063: "sugar_g",      # Sugars, Total NLEA (variant)
    1093: "sodium_mg",
    1258: "satfat_g",     # Fatty acids, total saturated
    1089: "iron_mg",
    1087: "calcium_mg",
    1092: "potassium_mg",
}
# Many Foundation foods report energy ONLY as Atwater factors, not id 1008.
# Used as a fallback so those foods don't resolve to 0 kcal. 1008 is preferred.
_ENERGY_FALLBACK_IDS = (2047, 2048)  # Energy (Atwater General / Specific Factors)

_NUTRIENT_FIELDS = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g",
    "sodium_mg", "satfat_g", "iron_mg", "calcium_mg", "potassium_mg",
]


def _parse_food(food: dict, name: str) -> dict | None:
    """Map one FDC search hit to a per-100g food_entity dict (None if no energy)."""
    nutrients = {field: 0.0 for field in _NUTRIENT_FIELDS}
    energy_fallback = 0.0
    for fn in food.get("foodNutrients", []):
        nid = fn.get("nutrientId")
        value = fn.get("value")
        if value is None:
            continue
        field = _NUTRIENT_MAP.get(nid)
        if field and not nutrients[field]:  # don't overwrite with a variant's 0
            nutrients[field] = float(value)
        elif nid in _ENERGY_FALLBACK_IDS and not energy_fallback:
            energy_fallback = float(value)
    if not nutrients["calories"] and energy_fallback:  # 1008 missing -> Atwater
        nutrients["calories"] = energy_fallback
    if nutrients["calories"] <= 0:  # 0-kcal hit = junk match; let the caller try the next
        return None

    entry = {
        "canonical_name": (food.get("description") or name).title()[:120],
        "aliases": [name.lower()],
        "fdc_id": food.get("fdcId"),
        "source": "usda",
        "default_unit": "serving",
        "default_grams": 100.0,
    }
    entry.update(nutrients)
    return entry


def _query(name: str, data_types: list[str], timeout: float) -> dict | None:
    params = {
        "api_key": config.USDA_API_KEY,
        "query": name,
        "dataType": data_types,
        "pageSize": 5,  # scan a few and skip 0-kcal junk matches
    }
    try:
        resp = httpx.get(f"{config.USDA_BASE_URL}/foods/search", params=params, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None
    for food in (data.get("foods") or []):
        entry = _parse_food(food, name)
        if entry:
            return entry
    return None


def search_food(name: str, timeout: float = 8.0) -> dict | None:
    """Return a per-100g food_entity dict for `name`, or None if unresolved.

    Two passes: first the curated generic datasets (Foundation / SR Legacy / Survey),
    which give clean whole-food nutrition (a real banana, not a banana snack); then,
    only if those miss, the huge Branded set — where packaged/branded/composed foods
    (Planters, Popeyes, protein bars) live with full micronutrients. This resolves
    branded foods to authoritative USDA data (sugar/fiber/sodium included) instead of
    a macros-only LLM estimate, without letting a branded product outrank a whole food.
    FDC reports per-100g `value` across all data types."""
    return (_query(name, ["Foundation", "SR Legacy", "Survey (FNDDS)"], timeout)
            or _query(name, ["Branded"], timeout))
