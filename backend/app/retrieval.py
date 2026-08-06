"""Hybrid semantic retrieval: pgvector (dense) + Postgres full-text (sparse),
fused with Reciprocal Rank Fusion (k=60) — all in one SQL statement, executed
on the read-only role under RLS.

RRF operates on ranks, sidestepping the incompatible score scales of cosine
distance vs. ts_rank. This is the semantic/hybrid arm of the router.
"""

from __future__ import annotations

from datetime import datetime

from . import config, db
from .embeddings import embed
from .foods import OFFICE_LOCATIONS

# Columns returned for a meal (excludes embedding + tsvector, which aren't JSON-safe).
MEAL_COLS = [
    "id", "user_id", "eaten_at", "meal_type", "location_text", "photo_uri", "note_text",
    "description", "tags", "source", "confidence",
    "total_calories", "total_protein_g", "total_carbs_g", "total_fat_g",
    "total_fiber_g", "total_sugar_g", "total_sodium_mg", "total_satfat_g",
    "total_iron_mg", "total_calcium_mg", "total_potassium_mg", "created_at",
]
_M = ", ".join(f"m.{c}" for c in MEAL_COLS)

_OFFICE_NAMES = [loc["name"] for loc in OFFICE_LOCATIONS]


def _vec_literal(text: str) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in embed(text)) + "]"


def semantic_search(
    question: str,
    user_id: str = config.DEFAULT_USER_ID,
    start: datetime | None = None,
    end: datetime | None = None,
    location: str | None = None,
    k: int = config.SEMANTIC_TOP_K,
) -> list[dict]:
    params: dict = {"emb": _vec_literal(question), "q": question, "k": k, "rrf": config.RRF_K}

    filters = []
    if start:
        filters.append("eaten_at >= %(start)s")
        params["start"] = start
    if end:
        filters.append("eaten_at <= %(end)s")
        params["end"] = end
    if location and location.lower() in ("office", "work"):
        filters.append("location_text = ANY(%(locs)s)")
        params["locs"] = _OFFICE_NAMES
    elif location:
        filters.append("location_text ILIKE %(loc)s")
        params["loc"] = f"%{location}%"
    where = (" AND " + " AND ".join(filters)) if filters else ""

    sql = f"""
    WITH dense AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> %(emb)s::vector) AS rnk
        FROM meals
        WHERE embedding IS NOT NULL {where}
        ORDER BY embedding <=> %(emb)s::vector
        LIMIT %(k)s
    ),
    sparse AS (
        SELECT id, row_number() OVER (
                   ORDER BY ts_rank(description_tsv, plainto_tsquery('english', %(q)s)) DESC
               ) AS rnk
        FROM meals
        WHERE description_tsv @@ plainto_tsquery('english', %(q)s) {where}
        LIMIT %(k)s
    ),
    fused AS (
        SELECT coalesce(d.id, s.id) AS id,
               coalesce(1.0 / (%(rrf)s + d.rnk), 0) +
               coalesce(1.0 / (%(rrf)s + s.rnk), 0) AS score
        FROM dense d
        FULL OUTER JOIN sparse s ON d.id = s.id
    )
    SELECT {_M}, f.score
    FROM fused f
    JOIN meals m ON m.id = f.id
    ORDER BY f.score DESC
    LIMIT %(k)s
    """
    return db.run_readonly_sql(sql, user_id, params)


def recent_meals(
    user_id: str = config.DEFAULT_USER_ID,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 6,
) -> list[dict]:
    """Top meals in a timeframe (by calories) — used to cite aggregate answers."""
    filters = []
    params: dict = {"limit": limit}
    if start:
        filters.append("eaten_at >= %(start)s")
        params["start"] = start
    if end:
        filters.append("eaten_at <= %(end)s")
        params["end"] = end
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    sql = f"SELECT {', '.join(MEAL_COLS)} FROM meals {where} ORDER BY total_calories DESC LIMIT %(limit)s"
    return db.run_readonly_sql(sql, user_id, params)
