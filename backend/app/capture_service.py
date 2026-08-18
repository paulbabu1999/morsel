"""Capture pipeline glue: extraction -> nutrition resolution -> draft / meal.

`analyze` produces an unsaved, editable draft. `build_meal` turns a confirmed
(possibly edited) draft into a persistable meal (items re-resolved so edits to
name/quantity yield correct nutrition).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from .foods import FOODS, LOCATIONS_BY_NAME
from .llm.extract import extract_meal, refine_meal
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
        # The LLM's own "as eaten" energy density anchors the lookup against
        # raw-vs-cooked density blowups (see resolve_item).
        raw_cal, raw_g = raw.get("calories"), (raw.get("estimated_grams") or raw.get("grams"))
        anchor = float(raw_cal) * 100.0 / float(raw_g) if raw_cal and raw_g and float(raw_g) > 0 else None
        item = resolve.resolve_item(
            raw.get("name") or raw.get("raw_name", ""),
            quantity=raw.get("quantity") or 1,
            unit=raw.get("unit"),
            grams=raw.get("estimated_grams") or raw.get("grams"),
            fallback=fallback or None,
            anchor_kcal_per_100g=anchor,
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
    images: list[tuple[bytes, str]] | None = None,
    meal_type: str | None = None,
    location: str | None = None,
    source: str = "phone",
) -> dict:
    images = images or []
    extraction = extract_meal(note, images)
    confidence = float(extraction.get("confidence", 0.9))
    items = _resolve_items(extraction.get("items", []), confidence)

    mtype = meal_type or extraction.get("meal_type") or "snack"
    loc = location or extraction.get("location")
    description = extraction.get("description") or _describe(mtype, items, loc, note)

    # Thumbnail every photo. The first is the primary thumbnail (photo_uri, used in
    # lists); photo_uris keeps them all for the meal's gallery.
    thumbs = [t for t in (_thumbnail_data_url(b) for b, _mt in images) if t]
    draft = {
        "items": items,
        "meal_type": mtype,
        "location": loc,
        "note": note,
        "source": source,
        "photo_uri": thumbs[0] if thumbs else None,
        "photo_uris": thumbs,
        "photo_count": len(images),
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


def refine(
    items: list[dict],
    correction: str,
    meal_type: str | None = None,
    location: str | None = None,
    note: str | None = None,
    source: str = "phone",
    photo_uris: list[str] | None = None,
) -> dict:
    """Apply a plain-language correction to a draft's items and re-resolve nutrition.
    Falls back to the original items unchanged if the model can't help (stub/error)."""
    ext = refine_meal(items, correction)
    if not ext or not ext.get("items"):
        ext = {"items": items, "extractor": "correction (no change)"}
    confidence = float(ext.get("confidence", 0.85))
    resolved = _resolve_items(ext.get("items", []), confidence)
    mtype = meal_type or ext.get("meal_type") or "snack"
    loc = location if location is not None else ext.get("location")
    thumbs = list(photo_uris or [])
    draft = {
        "items": resolved,
        "meal_type": mtype,
        "location": loc,
        "note": note,
        "source": source,
        "photo_uri": thumbs[0] if thumbs else None,
        "photo_uris": thumbs,
        "photo_count": len(thumbs),
        "description": ext.get("description") or _describe(mtype, resolved, loc, note),
        "tags": _tags(resolved, loc),
        "confidence": round(confidence, 2),
        "extractor": ext.get("extractor", "correction"),
        "extraction_note": f'Adjusted from your note: "{correction[:80]}".',
    }
    draft.update(_totals(resolved))
    return draft


def _normalize_eaten_at(eaten_at):
    """Store meal times in the server (UTC) frame as naive datetimes, matching the
    default `datetime.now()`. A custom time picked on the client is sent tz-aware
    (its local pick converted to UTC); convert it to naive UTC here. Naive input is
    trusted as-is. Absent -> now."""
    if eaten_at is None:
        return datetime.now().replace(microsecond=0)
    if eaten_at.tzinfo is not None:
        return eaten_at.astimezone(timezone.utc).replace(tzinfo=None, microsecond=0)
    return eaten_at.replace(microsecond=0)


def build_meal(create: dict) -> dict:
    """Turn a confirmed MealCreate dict into a persistable meal (items re-resolved)."""
    raw_items = [
        {"name": i.get("name"), "quantity": i.get("quantity", 1), "unit": i.get("unit"),
         "grams": i.get("grams"), "calories": i.get("calories")}  # calories anchors the density check
        for i in create["items"]
    ]
    items = _resolve_items(raw_items, confidence=0.95)
    mtype = create["meal_type"]
    loc = create.get("location")
    note = create.get("note")
    description = create.get("description") or _describe(mtype, items, loc, note)

    meal = {
        "id": f"meal-{uuid.uuid4().hex[:8]}",
        "eaten_at": _normalize_eaten_at(create.get("eaten_at")),
        "meal_type": mtype,
        "location_text": loc,
        "photo_uri": create.get("photo_uri"),
        "photo_uris": create.get("photo_uris")
        or ([create["photo_uri"]] if create.get("photo_uri") else []),
        "note_text": note,
        "description": description,
        "tags": create.get("tags") or _tags(items, loc),
        "source": create.get("source", "phone"),
        "confidence": round(sum(i["confidence"] for i in items) / max(1, len(items)), 2),
        "items": items,
    }
    meal.update(_totals(items))
    return meal
