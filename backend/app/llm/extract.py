"""Multimodal meal extraction: (photo + note) -> structured items + portions.

Real: Claude vision via a forced tool call (constrained JSON). Per-item macro
estimates from Claude become the `fallback` used by the nutrition resolver when
a food isn't in food_entities and USDA can't be reached.

Stub: keyword match of the note against the food catalog (no pixels read).
Returns the same shape so the capture flow is identical.
"""

from __future__ import annotations

import random
from datetime import datetime

from .. import config
from ..foods import FOODS, LOCATIONS_BY_NAME, foods_for_meal
from . import client

_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "quantity": {"type": "number"},
                    "unit": {"type": "string"},
                    "estimated_grams": {"type": "number"},
                    "calories": {"type": "number"},
                    "protein_g": {"type": "number"},
                    "carbs_g": {"type": "number"},
                    "fat_g": {"type": "number"},
                },
                "required": ["name"],
            },
        },
        "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
        "location": {"type": ["string", "null"]},
        "description": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["items", "meal_type", "description", "confidence"],
}

_SYSTEM = (
    "You extract a structured meal record from a short note and/or one or more "
    "food photos. Identify each distinct food item, estimate its portion (quantity, "
    "unit, and grams), and give rough per-item calories and macros "
    "(protein/carbs/fat). Infer meal_type from the food and time, and location if "
    "mentioned. Write a one-line description. Set confidence in [0,1]. Emit best "
    "estimates; the app looks up authoritative nutrition afterward.\n"
    "\n"
    "MULTIPLE PHOTOS = ONE MEAL. You may be given several photos of the SAME meal: "
    "the finished dish plus close-ups of ingredients that went into it (e.g. "
    "overnight oats shown as the final jar, plus the oats, milk, and berries added). "
    "Treat all photos together as a single meal. Use the ingredient photos to "
    "identify components and estimate portions you can't judge from the final dish, "
    "but DO NOT double-count: if something appears both on its own and mixed into the "
    "final dish, count it exactly once. Break a composed dish into its ingredient "
    "items (rolled oats, milk, honey, granola, berries…) rather than one vague "
    "'overnight oats' line, and sum the components.\n"
    "\n"
    "Name each item specifically and generically enough to match a nutrition "
    "database (USDA FoodData Central): prefer 'rolled oats', 'plain whole milk "
    "yogurt', 'blueberries', 'almond milk' over brand names or vague labels, so the "
    "lookup resolves to the right food."
)

_KEYWORD_HINTS = {
    "coffee": "Iced Coffee", "cold brew": "Cold Brew", "burrito": "Chicken Burrito",
    "taco": "Beef Tacos", "pizza": "Margherita Pizza", "salad": "Caesar Salad with Chicken",
    "ramen": "Ramen", "pad thai": "Pad Thai", "curry": "Green Curry with Rice",
    "risotto": "Mushroom Risotto", "mushroom": "Mushroom Stir Fry", "salmon": "Salmon with Quinoa",
    "eggs": "Scrambled Eggs", "yogurt": "Greek Yogurt with Berries", "toast": "Avocado Toast",
    "oatmeal": "Oatmeal with Banana", "smoothie": "Protein Smoothie", "pancakes": "Blueberry Pancakes",
    "poke": "Poke Bowl", "falafel": "Falafel Wrap", "sandwich": "Turkey Sandwich",
    "rice bowl": "Chicken Rice Bowl", "chicken": "Chicken Rice Bowl", "bar": "Protein Bar",
    "apple": "Apple", "nuts": "Mixed Nuts", "chocolate": "Dark Chocolate",
}


def extract_meal(
    note: str | None,
    images: list[tuple[bytes, str]] | None = None,
    *,
    photo_bytes: bytes | None = None,
    media_type: str = "image/jpeg",
) -> dict:
    """Return {items, meal_type, location, description, confidence, extractor}.

    `images` is a list of (bytes, media_type) for a multi-photo meal (final dish +
    ingredients). `photo_bytes`/`media_type` are the legacy single-image path.
    """
    if images is None and photo_bytes is not None:
        images = [(photo_bytes, media_type)]
    images = images or []
    real = _extract_real(note, images)
    if real is not None:
        real["extractor"] = f"{config.LLM_PROVIDER or config.LLM_KIND}-vision (structured outputs)"
        return real
    result = _extract_stub(note)
    result["extractor"] = "stub (keyword match; real = Claude vision structured outputs)"
    return result


def _extract_real(note, images: list[tuple[bytes, str]]) -> dict | None:
    if note and len(images) > 1:
        user_text = f"Note: {note}\n({len(images)} photos of the same meal follow.)"
    elif note:
        user_text = f"Note: {note}"
    elif len(images) > 1:
        user_text = f"No note provided; {len(images)} photos of the same meal follow."
    else:
        user_text = "No note provided; use the photo."
    out = client.call_tool(
        _SYSTEM, user_text, "record_meal", _EXTRACT_SCHEMA,
        images=images, max_tokens=1500,
    )
    if not out or not out.get("items"):
        return None
    return out


# --- stub -----------------------------------------------------------------

def _guess_meal_type(now: datetime, note: str) -> str:
    n = note.lower()
    for mt in ("breakfast", "lunch", "dinner", "snack"):
        if mt in n:
            return mt
    h = now.hour
    return "breakfast" if h < 11 else "lunch" if h < 15 else "snack" if h < 17 else "dinner"


def _guess_location(note: str) -> str | None:
    n = note.lower()
    for name, loc in LOCATIONS_BY_NAME.items():
        if name in n or name.split("(")[0].strip() in n:
            return loc["name"]
    if any(w in n for w in ["home", "cooked", "made", "leftover"]):
        return "Home"
    return None


def _extract_stub(note: str | None) -> dict:
    now = datetime.now()
    note = (note or "").strip()
    n = note.lower()
    rng = random.Random(f"{note}:{now:%Y%m%d%H}")

    found: list[str] = []
    seen: set[str] = set()
    for kw, food_name in sorted(_KEYWORD_HINTS.items(), key=lambda x: -len(x[0])):
        if kw in n and food_name not in seen:
            found.append(food_name)
            seen.add(food_name)

    meal_type = _guess_meal_type(now, note)
    if not found:
        options = [f["name"] for f in foods_for_meal(meal_type)]
        found = rng.sample(options, k=min(rng.choice([1, 2]), len(options)))

    items = [{"name": name, "quantity": 1, "unit": None, "estimated_grams": None} for name in found]
    location = _guess_location(note)
    where = f" at {location}" if location and location != "Home" else " at home" if location else ""
    description = f"{meal_type.capitalize()}{where}: {', '.join(found)}." + (f" Note: {note}" if note else "")
    return {
        "items": items,
        "meal_type": meal_type,
        "location": location,
        "description": description,
        "confidence": round(0.8 + rng.random() * 0.15, 2),
    }
