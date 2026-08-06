"""Capture pipeline glue: extraction -> nutrition resolution -> draft / meal.

`analyze` produces an unsaved, editable draft. `build_meal` turns a confirmed
(possibly edited) draft into a persistable meal (items re-resolved so edits to
name/quantity yield correct nutrition).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from .foods import FOODS, LOCATIONS_BY_NAME
from .llm.extract import extract_meal
from .models import NUTRIENTS
from .nutrition import resolve

_FOODS_BY_NAME = {f["name"].lower(): f for f in FOODS}


def _resolve_items(raw_items: list[dict], confidence: float) -> list[dict]:
    items = []
    for raw in raw_items:
        fallback = {n: raw[n] for n in NUTRIENTS if raw.get(n) is not None}
        if fallback:
            fallback["grams"] = raw.get("estimated_grams") or raw.get("grams")
            fallback["unit"] = raw.get("unit")
        item = resolve.resolve_item(
            raw.get("name") or raw.get("raw_name", ""),
            quantity=raw.get("quantity") or 1,
            unit=raw.get("unit"),
            grams=raw.get("estimated_grams") or raw.get("grams"),
            fallback=fallback or None,
        )
        item["id"] = f"item-{uuid.uuid4().hex[:8]}"
        item["confidence"] = round(confidence, 2)
        items.append(item)
    return items


def _totals(items: list[dict]) -> dict:
    out = {}
    for n in NUTRIENTS:
        s = sum(i[n] for i in items)
        out["total_calories" if n == "calories" else f"total_{n}"] = (
            int(round(s)) if n == "calories" else round(s, 1)
        )
    return out


def _tags(items: list[dict], location: str | None) -> list[str]:
    tags: list[str] = []
    for it in items:
        f = _FOODS_BY_NAME.get(it["canonical_name"].lower())
        if f:
            tags.extend(f["tags"])
    loc = LOCATIONS_BY_NAME.get((location or "").lower(), {})
    if loc.get("kind") and loc["kind"] != "home":
        tags.append(loc["kind"])
    if loc.get("eat_out"):
        tags.append("eating-out")
    return sorted(set(tags))


def _describe(meal_type: str, items: list[dict], location: str | None, note: str | None) -> str:
    names = ", ".join(i["canonical_name"] for i in items)
    where = f" at {location}" if location and location != "Home" else " at home" if location else ""
    desc = f"{meal_type.capitalize()}{where}: {names}."
    return desc + (f" Note: {note}" if note else "")


def analyze(
    note: str | None,
    photo_bytes: bytes | None = None,
    media_type: str = "image/jpeg",
    meal_type: str | None = None,
    location: str | None = None,
    source: str = "phone",
) -> dict:
    extraction = extract_meal(note, photo_bytes, media_type)
    confidence = float(extraction.get("confidence", 0.9))
    items = _resolve_items(extraction.get("items", []), confidence)

    mtype = meal_type or extraction.get("meal_type") or "snack"
    loc = location or extraction.get("location")
    description = extraction.get("description") or _describe(mtype, items, loc, note)

    draft = {
        "items": items,
        "meal_type": mtype,
        "location": loc,
        "note": note,
        "source": source,
        "photo_uri": None,
        "description": description,
        "tags": _tags(items, loc),
        "confidence": round(confidence, 2),
        "extractor": extraction.get("extractor", ""),
        "extraction_note": (
            f"{len(items)} item(s) identified; nutrition resolved via "
            f"{', '.join(sorted({i.get('resolution_method', '?') for i in items}))}."
        ),
    }
    draft.update(_totals(items))
    return draft


def build_meal(create: dict) -> dict:
    """Turn a confirmed MealCreate dict into a persistable meal (items re-resolved)."""
    raw_items = [
        {"name": i.get("name"), "quantity": i.get("quantity", 1), "unit": i.get("unit"), "grams": i.get("grams")}
        for i in create["items"]
    ]
    items = _resolve_items(raw_items, confidence=0.95)
    mtype = create["meal_type"]
    loc = create.get("location")
    note = create.get("note")
    description = create.get("description") or _describe(mtype, items, loc, note)

    meal = {
        "id": f"meal-{uuid.uuid4().hex[:8]}",
        "eaten_at": create.get("eaten_at") or datetime.now().replace(microsecond=0),
        "meal_type": mtype,
        "location_text": loc,
        "photo_uri": create.get("photo_uri"),
        "note_text": note,
        "description": description,
        "tags": create.get("tags") or _tags(items, loc),
        "source": create.get("source", "phone"),
        "confidence": round(sum(i["confidence"] for i in items) / max(1, len(items)), 2),
        "items": items,
    }
    meal.update(_totals(items))
    return meal
