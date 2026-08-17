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
    loc_name = (location or "").strip()
    known = LOCATIONS_BY_NAME.get(loc_name.lower(), {})
    if known.get("kind") and known["kind"] != "home":
        tags.append(known["kind"])
    # Any named place that isn't home counts as eating out — so "Dunkin",
    # "Starbucks", etc. (not in the seed catalog) are still tagged eating-out.
    if loc_name and loc_name.lower() != "home" and known.get("eat_out", True):
        tags.append("eating-out")
    return sorted(set(tags))


def _thumbnail_data_url(photo_bytes: bytes, max_px: int = 384) -> str | None:
    """Resize the captured photo to a small JPEG thumbnail and return it as a
    data: URL, so the real photo (not a placeholder) shows up in history. Kept
    small (~20-40 KB) to stay light in the DB and API responses."""
    try:
        import base64
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
        img.thumbnail((max_px, max_px))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=60, optimize=True)
        b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        return None


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
        "photo_uri": _thumbnail_data_url(photo_bytes) if photo_bytes else None,
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
