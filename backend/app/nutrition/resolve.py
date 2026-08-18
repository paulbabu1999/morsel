"""Entity resolution + per-item nutrition.

Pipeline for each captured food (ADD/UPDATE/NOOP, à la the research doc):
  1. normalize the raw name
  2. exact / alias match against food_entities        -> link (NOOP)
  3. else embedding similarity >= threshold           -> link (NOOP)
  4. else USDA FoodData Central lookup, cache it       -> link (ADD)
  5. else Claude's own estimate (or zeros), cache it   -> link (ADD)
Then scale the entity's per-100g nutrition by the portion's grams.

`food_entities` is global (no RLS), so it's read/written on the app pool
without a user GUC.
"""

from __future__ import annotations

import re

from .. import config, db
from ..embeddings import embed
from . import openfoodfacts, usda

_NUTRIENTS = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g",
    "sodium_mg", "satfat_g", "iron_mg", "calcium_mg", "potassium_mg",
]
_MODIFIERS = ("leftover", "leftovers", "some", "half a", "half", "a", "an", "the", "my", "homemade")


def normalize_name(raw: str) -> str:
    s = (raw or "").strip().lower()
    for m in _MODIFIERS:
        s = re.sub(rf"^{re.escape(m)}\b\s*", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _vec_literal(text: str) -> str:
    """pgvector accepts the '[f,f,...]' text form cast to ::vector. Values are
    our own floats (no injection risk) and still passed as a bound parameter."""
    return "[" + ",".join(f"{x:.6f}" for x in embed(text)) + "]"


def _row_to_entity(row: dict) -> dict:
    return {k: row[k] for k in (["id", "canonical_name", "default_grams", "default_unit"] + _NUTRIENTS)}


def _find_or_create_entity(norm: str, fallback: dict | None) -> tuple[dict, str]:
    """Return (entity per-100g dict, method) — method in {alias, similar, usda, fallback}."""
    with db.app_pool().connection() as conn:
        with conn.cursor() as cur:
            # 2. exact / alias — no embedding needed (the common path; skips a
            # network call entirely when EMBED_PROVIDER=gemini).
            cur.execute(
                """SELECT * FROM food_entities
                   WHERE lower(canonical_name) = %s
                      OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE lower(a) = %s)
                   LIMIT 1""",
                (norm, norm),
            )
            row = cur.fetchone()
            if row:
                return _row_to_entity(_named(cur, row)), "alias"

            # only now do we need the embedding (similarity + possible insert)
            vec = _vec_literal(norm)

            # 3. embedding similarity
            cur.execute(
                """SELECT *, 1 - (name_embedding <=> %s::vector) AS sim
                   FROM food_entities WHERE name_embedding IS NOT NULL
                   ORDER BY name_embedding <=> %s::vector LIMIT 1""",
                (vec, vec),
            )
            row = cur.fetchone()
            if row:
                named = _named(cur, row)
                if named.get("sim", 0) >= config.ENTITY_MATCH_THRESHOLD:
                    return _row_to_entity(named), "similar"

            # 4. USDA lookup, else 4b. Open Food Facts (international/branded,
            # covers regional dishes USDA lacks), else 5. the LLM estimate. A hit
            # with 0 kcal is junk (e.g. "beef patty" -> "Bologna, Beef") — treat
            # it as a miss and try the next tier.
            entry = usda.search_food(norm)
            method = "usda"
            if entry is None or float(entry.get("calories") or 0) <= 0:
                entry = openfoodfacts.search_food(norm)
                method = "off"
            if entry is None or float(entry.get("calories") or 0) <= 0:
                entry = _fallback_entity(norm, fallback)
                method = "fallback"
            # Only CACHE resolutions that carry real nutrition. Caching a 0-kcal
            # miss (USDA down / no estimate) would poison every future lookup of
            # this name; use it ephemerally (id=None, not persisted) instead.
            if float(entry.get("calories") or 0) > 0:
                entity = _insert_entity(cur, entry, vec)
                conn.commit()
                return entity, method
            return _ephemeral_entity(entry), method + "-uncached"


def _ephemeral_entity(entry: dict) -> dict:
    e = {
        "id": None,
        "canonical_name": entry["canonical_name"],
        "default_grams": entry.get("default_grams", 100),
        "default_unit": entry.get("default_unit", "serving"),
    }
    for n in _NUTRIENTS:
        e[n] = entry.get(n, 0)
    return e


def _named(cur, row: tuple) -> dict:
    cols = [d.name for d in cur.description]
    return dict(zip(cols, row))


def _fallback_entity(norm: str, fallback: dict | None) -> dict:
    """Build a per-100g entity from Claude's estimate (given per the whole item)
    or zeros. `fallback` carries absolute estimates + grams so we can normalize."""
    entry = {
        "canonical_name": norm.title()[:120],
        "aliases": [norm],
        "fdc_id": None,
        "source": "llm" if fallback else "manual",
        "default_unit": (fallback or {}).get("unit", "serving"),
        "default_grams": float((fallback or {}).get("grams", 100) or 100),
    }
    grams = entry["default_grams"] or 100
    for n in _NUTRIENTS:
        absolute = float((fallback or {}).get(n, 0) or 0)
        entry[n] = absolute * 100.0 / grams  # -> per 100g
    return entry


def _insert_entity(cur, entry: dict, vec: str) -> dict:
    cols = ["canonical_name", "aliases", "fdc_id", "source", "default_unit", "default_grams", *_NUTRIENTS]
    placeholders = ", ".join(["%s"] * len(cols)) + ", %s::vector"
    cur.execute(
        f"INSERT INTO food_entities ({', '.join(cols)}, name_embedding) "
        f"VALUES ({placeholders}) RETURNING *",
        tuple(entry.get(c) for c in cols) + (vec,),
    )
    return _row_to_entity(_named(cur, cur.fetchone()))


def resolve_item(
    raw_name: str,
    quantity: float = 1.0,
    unit: str | None = None,
    grams: float | None = None,
    fallback: dict | None = None,
    anchor_kcal_per_100g: float | None = None,
) -> dict:
    """Resolve one food to a normalized meal_item dict with ABSOLUTE nutrition.

    `anchor_kcal_per_100g` is the LLM's own "as eaten" energy density (its per-item
    kcal / grams * 100). If the matched food is far denser than that, it's almost
    certainly the RAW form of a food eaten cooked (dry rice/lentils vs a cooked cup),
    which otherwise triples the calories. In that case we rescale the whole per-100g
    profile down to the estimate — cooking mainly adds water, so every nutrient
    dilutes together and the ratios stay right."""
    norm = normalize_name(raw_name)
    entity, method = _find_or_create_entity(norm, fallback)

    per100 = {n: float(entity.get(n) or 0) for n in _NUTRIENTS}
    if (anchor_kcal_per_100g and per100["calories"] > anchor_kcal_per_100g * 1.8
            and not method.startswith("fallback")):
        scale = anchor_kcal_per_100g / per100["calories"]
        per100 = {n: v * scale for n, v in per100.items()}
        method += "+anchored"

    default_grams = float(entity.get("default_grams") or 100)
    portion_grams = float(grams) if grams else quantity * default_grams
    factor = portion_grams / 100.0

    item = {
        "food_entity_id": entity["id"],
        "raw_name": raw_name,
        "canonical_name": entity["canonical_name"],
        "quantity": quantity,
        "unit": unit or entity.get("default_unit") or "serving",
        "grams": round(portion_grams, 1),
        "resolution_method": method,
    }
    for n in _NUTRIENTS:
        val = per100[n] * factor
        item[n] = int(round(val)) if n == "calories" else round(val, 1)
    return item
