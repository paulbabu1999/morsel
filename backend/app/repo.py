"""Meal + profile persistence and reads. All meal access is RLS-scoped via
app_tx; food_entities is global. Shared by the API endpoints and the seeder."""

from __future__ import annotations

from datetime import datetime

from . import config, db
from .embeddings import embed
from .retrieval import MEAL_COLS

_NUTRIENTS = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g",
    "sodium_mg", "satfat_g", "iron_mg", "calcium_mg", "potassium_mg",
]
_ITEM_COLS = [
    "id", "meal_id", "user_id", "food_entity_id", "raw_name", "canonical_name",
    "quantity", "unit", "grams", *_NUTRIENTS, "confidence",
]
_PROFILE_COLS = [
    "user_id", "age", "sex", "height_cm", "weight_kg", "activity_level", "goal_type",
    "goal_rate", "daily_calorie_target", "protein_target_g", "carb_target_g", "fat_target_g",
    "fiber_target_g", "sugar_limit_g", "sodium_limit_mg", "satfat_limit_g", "iron_target_mg",
    "calcium_target_mg", "potassium_target_mg", "tdee_estimate", "target_source", "rationale",
    "onboarded", "updated_at",
]


def _vec_literal(text: str) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in embed(text)) + "]"


# --- writes ---------------------------------------------------------------

def insert_meal_rows(cur, meal: dict, user_id: str, embedding: str | None = None) -> None:
    """Insert one meal + its items using an existing RLS-scoped cursor.

    `embedding` is the pgvector literal for the meal description. Pass it in when
    computed BEFORE the transaction (see persist_meal) so a network-backed
    embedding call never holds a scarce pooled connection; when omitted it's
    computed here (the batch seeder, which isn't on a latency-sensitive path)."""
    emb = embedding if embedding is not None else _vec_literal(meal["description"])
    cur.execute(
        """INSERT INTO meals
           (id, user_id, eaten_at, meal_type, location_text, photo_uri, photo_uris, note_text,
            description, tags, source, confidence,
            total_calories, total_protein_g, total_carbs_g, total_fat_g,
            total_fiber_g, total_sugar_g, total_sodium_mg, total_satfat_g,
            total_iron_mg, total_calcium_mg, total_potassium_mg, embedding)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)""",
        (
            meal["id"], user_id, meal["eaten_at"], meal["meal_type"], meal.get("location_text"),
            meal.get("photo_uri"), meal.get("photo_uris", []), meal.get("note_text"), meal["description"], meal.get("tags", []),
            meal.get("source", "phone"), meal.get("confidence", 0.9),
            meal["total_calories"], meal["total_protein_g"], meal["total_carbs_g"], meal["total_fat_g"],
            meal["total_fiber_g"], meal["total_sugar_g"], meal["total_sodium_mg"], meal["total_satfat_g"],
            meal["total_iron_mg"], meal["total_calcium_mg"], meal["total_potassium_mg"], emb,
        ),
    )
    for it in meal["items"]:
        cur.execute(
            f"INSERT INTO meal_items ({', '.join(_ITEM_COLS)}) "
            f"VALUES ({', '.join(['%s'] * len(_ITEM_COLS))})",
            (
                it["id"], meal["id"], user_id, it.get("food_entity_id"), it["raw_name"],
                it["canonical_name"], it["quantity"], it["unit"], it["grams"],
                *[it[n] for n in _NUTRIENTS], it.get("confidence", 0.9),
            ),
        )


def persist_meal(meal: dict, user_id: str = config.DEFAULT_USER_ID) -> dict:
    # Compute the embedding BEFORE opening the transaction: in hosted mode this is
    # a synchronous Gemini HTTP call (with retries/backoff), and holding one of the
    # few pooled connections across it would serialize saves and can exhaust the pool.
    emb = _vec_literal(meal["description"])
    with db.app_tx(user_id) as cur:
        insert_meal_rows(cur, meal, user_id, embedding=emb)
    return get_meal(meal["id"], user_id)


# --- reads ----------------------------------------------------------------

def list_meals(
    user_id: str = config.DEFAULT_USER_ID,
    start: datetime | None = None,
    end: datetime | None = None,
    meal_type: str | None = None,
    q: str | None = None,
    limit: int = 200,
) -> list[dict]:
    filters, params = [], {"limit": limit}
    if start:
        filters.append("eaten_at >= %(start)s"); params["start"] = start
    if end:
        filters.append("eaten_at <= %(end)s"); params["end"] = end
    if meal_type:
        filters.append("meal_type = %(mt)s"); params["mt"] = meal_type
    if q:
        filters.append(
            "(description ILIKE %(q)s OR location_text ILIKE %(q)s "
            "OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE %(q)s))"
        )
        params["q"] = f"%{q}%"
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    sql = f"SELECT {', '.join(MEAL_COLS)} FROM meals {where} ORDER BY eaten_at DESC LIMIT %(limit)s"
    with db.app_tx(user_id) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def get_meal(meal_id: str, user_id: str = config.DEFAULT_USER_ID) -> dict | None:
    with db.app_tx(user_id) as cur:
        cur.execute(f"SELECT {', '.join(MEAL_COLS)} FROM meals WHERE id = %s", (meal_id,))
        meal = cur.fetchone()
        if not meal:
            return None
        cur.execute(
            f"SELECT {', '.join(c for c in _ITEM_COLS if c != 'meal_id')} "
            f"FROM meal_items WHERE meal_id = %s ORDER BY id",
            (meal_id,),
        )
        meal["items"] = cur.fetchall()
        return meal


def suggested_meals(
    user_id: str = config.DEFAULT_USER_ID,
    meal_type: str | None = None,
    limit: int = 6,
) -> list[dict]:
    """Recent, distinct meals to quick-re-log — deduped by description and biased to
    the current time-of-day meal_type. Full meals (with items) so the client can
    re-log a copy in one tap."""
    recent = list_meals(user_id, limit=80)
    if meal_type:  # surface matching meal_type first (breakfasts in the morning, etc.)
        recent = ([m for m in recent if m["meal_type"] == meal_type]
                  + [m for m in recent if m["meal_type"] != meal_type])
    seen: set[str] = set()
    chosen: list[dict] = []
    for m in recent:
        key = (m.get("description") or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            chosen.append(m)
        if len(chosen) >= limit:
            break
    if not chosen:
        return []
    # Attach items for all chosen meals in ONE query instead of an N+1 of get_meal
    # per suggestion. `recent` rows already carry the full MEAL_COLS, so we only
    # need their items — grouped to match get_meal's shape exactly.
    ids = [m["id"] for m in chosen]
    item_cols = [c for c in _ITEM_COLS if c != "meal_id"]
    with db.app_tx(user_id) as cur:
        cur.execute(
            f"SELECT meal_id, {', '.join(item_cols)} FROM meal_items "
            f"WHERE meal_id = ANY(%s) ORDER BY meal_id, id",
            (ids,),
        )
        rows = cur.fetchall()
    items_by_meal: dict[str, list] = {}
    for r in rows:
        items_by_meal.setdefault(r.pop("meal_id"), []).append(r)
    for m in chosen:
        m["items"] = items_by_meal.get(m["id"], [])
    return chosen


# --- weight ---------------------------------------------------------------

def add_weight(user_id: str, weight_kg: float, logged_at) -> dict:
    import uuid
    wid = f"w-{uuid.uuid4().hex[:10]}"
    with db.app_tx(user_id) as cur:
        cur.execute(
            "INSERT INTO weight_logs (id, user_id, logged_at, weight_kg) VALUES (%s,%s,%s,%s)",
            (wid, user_id, logged_at, float(weight_kg)),
        )
    return {"id": wid, "logged_at": logged_at, "weight_kg": round(float(weight_kg), 1)}


def list_weights(user_id: str = config.DEFAULT_USER_ID, limit: int = 180) -> list[dict]:
    with db.app_tx(user_id) as cur:
        cur.execute(
            "SELECT id, logged_at, weight_kg FROM weight_logs WHERE user_id = %s "
            "ORDER BY logged_at ASC LIMIT %s",
            (user_id, limit),
        )
        return cur.fetchall()


# --- profile --------------------------------------------------------------

def get_profile(user_id: str = config.DEFAULT_USER_ID) -> dict | None:
    with db.app_tx(user_id) as cur:
        cur.execute(f"SELECT {', '.join(_PROFILE_COLS)} FROM user_profile WHERE user_id = %s", (user_id,))
        return cur.fetchone()


def upsert_profile(profile: dict, user_id: str = config.DEFAULT_USER_ID) -> dict:
    data = {**profile, "user_id": user_id, "onboarded": True, "updated_at": datetime.now()}
    cols = [c for c in _PROFILE_COLS if c in data]
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "user_id")
    with db.app_tx(user_id) as cur:
        cur.execute(
            f"INSERT INTO user_profile ({', '.join(cols)}) "
            f"VALUES ({', '.join(['%s'] * len(cols))}) "
            f"ON CONFLICT (user_id) DO UPDATE SET {updates}",
            tuple(data[c] for c in cols),
        )
    return get_profile(user_id)


# --- users (auth; no RLS, so plain app-pool access) -----------------------

def get_user_by_email(email: str) -> dict | None:
    with db.app_pool().connection() as conn:
        with conn.cursor(row_factory=_dict_row()) as cur:
            cur.execute(
                "SELECT id, email, password_hash FROM users WHERE lower(email) = lower(%s)",
                (email,),
            )
            return cur.fetchone()


def get_user(user_id: str) -> dict | None:
    with db.app_pool().connection() as conn:
        with conn.cursor(row_factory=_dict_row()) as cur:
            cur.execute("SELECT id, email, created_at, display_name FROM users WHERE id = %s", (user_id,))
            return cur.fetchone()


def create_user(user_id: str, email: str, password_hash: str) -> None:
    with db.app_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash) VALUES (%s, %s, %s)",
                (user_id, email, password_hash),
            )
        conn.commit()


def _dict_row():
    from psycopg.rows import dict_row

    return dict_row
