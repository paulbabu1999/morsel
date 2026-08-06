"""Seed the database.

  * `seed_food_entities()` loads the bundled catalog (zero USDA calls) with name
    embeddings — this is the canonical-entity table the resolver matches against.
  * `seed_meals()` regenerates ~3 weeks of sample meals (relative to today),
    resolves each item to real nutrition, embeds the description, and writes
    meals + meal_items via the app pool (RLS-scoped).
  * `seed_all()` runs both; `reset()` truncates then reseeds.

Run as a module:  python -m app.seed
"""

from __future__ import annotations

from . import config, db
from .embeddings import embed
from .nutrition import resolve
from .nutrition.seed_foods import seed_food_entities as _bundled_foods

_NUTRIENTS = resolve._NUTRIENTS


def _vec_literal(text: str) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in embed(text)) + "]"


def seed_food_entities() -> int:
    foods = _bundled_foods()
    inserted = 0
    with db.app_pool().connection() as conn:
        with conn.cursor() as cur:
            for f in foods:
                cur.execute(
                    "SELECT 1 FROM food_entities WHERE lower(canonical_name)=%s",
                    (f["canonical_name"].lower(),),
                )
                if cur.fetchone():
                    continue
                vec = _vec_literal(f["canonical_name"])
                cols = ["canonical_name", "aliases", "source", "default_unit", "default_grams", *_NUTRIENTS]
                placeholders = ", ".join(["%s"] * len(cols)) + ", %s::vector"
                cur.execute(
                    f"INSERT INTO food_entities ({', '.join(cols)}, name_embedding) "
                    f"VALUES ({placeholders})",
                    tuple(f.get(c) for c in cols) + (vec,),
                )
                inserted += 1
        conn.commit()
    return inserted


def seed_meals(user_id: str = config.DEFAULT_USER_ID) -> int:
    """Import here to avoid a cycle; sample_meals lives in sample_data.py."""
    from .repo import insert_meal_rows
    from .sample_data import generate_sample_meals

    meals = generate_sample_meals()
    with db.app_tx(user_id) as cur:
        for meal in meals:
            insert_meal_rows(cur, meal, user_id)
    return len(meals)


def reset(user_id: str = config.DEFAULT_USER_ID) -> dict:
    # morsel_app has DML but not TRUNCATE; DELETE under the RLS-scoped tx clears
    # only this user's rows (meal_items cascade from meals anyway).
    with db.app_tx(user_id) as cur:
        cur.execute("DELETE FROM meal_items")
        cur.execute("DELETE FROM meals")
    return seed_all(user_id, include_foods=False)


def seed_all(user_id: str = config.DEFAULT_USER_ID, include_foods: bool = True) -> dict:
    foods = seed_food_entities() if include_foods else 0
    meals = seed_meals(user_id)
    return {"food_entities_added": foods, "meals_added": meals}


if __name__ == "__main__":
    print(seed_all())
