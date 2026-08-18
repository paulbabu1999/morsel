"""Open Food Facts — a large community, INTERNATIONAL + branded food database.

Used as a resolution tier AFTER USDA (which is US-centric and thin on regional
dishes like dal makhani, biryani, dosa) and BEFORE the LLM estimate, so those
foods still resolve to real label nutrition instead of a guess. Free, no key;
OFF asks callers to send a descriptive User-Agent. All `*_100g` fields are per
100 g. Any failure (rate-limit / non-JSON / miss) returns None so the caller
falls through to the next tier."""

from __future__ import annotations

import httpx

_UA = {"User-Agent": "Bite/1.0 (personal food-tracking app; contact: bite-app)"}
_URL = "https://world.openfoodfacts.org/cgi/search.pl"


def _num(nutriments: dict, *keys: str) -> float:
    for k in keys:
        v = nutriments.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return 0.0


def _parse(product: dict, name: str) -> dict | None:
    n = product.get("nutriments") or {}
    kcal = _num(n, "energy-kcal_100g")
    if kcal <= 0:  # some products only report kJ
        kj = _num(n, "energy-kj_100g", "energy_100g")
        kcal = kj / 4.184 if kj else 0.0
    if kcal <= 0:
        return None
    # OFF stores sodium in grams/100g; fall back to salt (salt = sodium * 2.5).
    sodium_g = _num(n, "sodium_100g") or (_num(n, "salt_100g") / 2.5)
    return {
        "canonical_name": ((product.get("product_name") or name).strip().title()[:120] or name.title()[:120]),
        "aliases": [name.lower()],
        "fdc_id": None,
        "source": "off",
        "default_unit": "serving",
        "default_grams": 100.0,
        "calories": kcal,
        "protein_g": _num(n, "proteins_100g"),
        "carbs_g": _num(n, "carbohydrates_100g"),
        "fat_g": _num(n, "fat_100g"),
        "fiber_g": _num(n, "fiber_100g"),
        "sugar_g": _num(n, "sugars_100g"),
        "sodium_mg": sodium_g * 1000.0,
        "satfat_g": _num(n, "saturated-fat_100g"),
        # OFF minerals are grams/100g -> mg
        "iron_mg": _num(n, "iron_100g") * 1000.0,
        "calcium_mg": _num(n, "calcium_100g") * 1000.0,
        "potassium_mg": _num(n, "potassium_100g") * 1000.0,
    }


def search_food(name: str, timeout: float = 8.0) -> dict | None:
    """Return a per-100g food_entity dict for `name`, or None if unresolved."""
    params = {
        "search_terms": name,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": 5,
        "fields": "product_name,nutriments",
    }
    try:
        resp = httpx.get(_URL, params=params, headers=_UA, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None
    for product in (data.get("products") or []):
        entry = _parse(product, name)
        if entry:
            return entry
    return None
