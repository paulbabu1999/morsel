"""Deterministic sample-meal generator (relative to today) for seeding Postgres.

Adapted from iteration-1's in-memory generator, but each item now goes through
the real nutrition resolver (`resolve.resolve_item`) so seeded meals carry full
macro + micro nutrition from `food_entities`. Requires food_entities to be
seeded first (seed_all handles ordering).
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, time, timedelta

from .foods import EAT_OUT_LOCATIONS, LOCATIONS_BY_NAME, FOODS, foods_for_meal
from .nutrition import resolve

SEED = 42
DAYS_OF_HISTORY = 24

_MEAL_WINDOWS = {
    "breakfast": (time(7, 30), time(9, 30)),
    "lunch": (time(12, 0), time(13, 45)),
    "dinner": (time(18, 30), time(20, 30)),
    "snack": (time(15, 0), time(16, 30)),
}
_NUTRIENTS = resolve._NUTRIENTS
_FOODS_BY_NAME = {f["name"]: f for f in FOODS}


def _rand_time(rng: random.Random, day: datetime, meal_type: str) -> datetime:
    start, end = _MEAL_WINDOWS[meal_type]
    lo, hi = start.hour * 60 + start.minute, end.hour * 60 + end.minute
    m = rng.randint(lo, hi)
    return day.replace(hour=m // 60, minute=m % 60, second=0, microsecond=0)


def _build_meal(rng, eaten_at, meal_type, food_names, location, source):
    items = []
    for name in food_names:
        qty = rng.choice([1.0, 1.0, 1.0, 0.75, 1.25])
        item = resolve.resolve_item(name, quantity=qty)
        item["id"] = f"item-{uuid.uuid4().hex[:8]}"
        item["confidence"] = round(0.82 + rng.random() * 0.15, 2)
        items.append(item)

    tags: list[str] = []
    for name in food_names:
        f = _FOODS_BY_NAME.get(name)
        if f:
            tags.extend(f["tags"])
    loc = LOCATIONS_BY_NAME.get((location or "").lower(), {})
    if loc.get("kind") and loc["kind"] != "home":
        tags.append(loc["kind"])
    if loc.get("eat_out"):
        tags.append("eating-out")
    tags = sorted(set(tags))

    item_names = ", ".join(i["canonical_name"] for i in items)
    where = f" at {location}" if location and location != "Home" else " at home"
    description = f"{meal_type.capitalize()}{where}: {item_names}."

    meal = {
        "id": f"meal-{uuid.uuid4().hex[:8]}",
        "eaten_at": eaten_at,
        "meal_type": meal_type,
        "location_text": location,
        "photo_uri": f"https://picsum.photos/seed/{uuid.uuid4().hex[:6]}/600/400",
        "note_text": None,
        "description": description,
        "tags": tags,
        "source": source,
        "confidence": round(sum(i["confidence"] for i in items) / max(1, len(items)), 2),
        "items": items,
    }
    for n in _NUTRIENTS:
        total = sum(i[n] for i in items)
        key = "total_calories" if n == "calories" else f"total_{n}"
        meal[key] = int(round(total)) if n == "calories" else round(total, 1)
    return meal


def generate_sample_meals() -> list[dict]:
    rng = random.Random(SEED)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    meals: list[dict] = []

    for days_ago in range(DAYS_OF_HISTORY, -1, -1):
        day = today - timedelta(days=days_ago)
        planned = ["breakfast", "lunch", "dinner"]
        if rng.random() < 0.6:
            planned.append("snack")

        for meal_type in planned:
            options = [f["name"] for f in foods_for_meal(meal_type)]
            n_items = 1 if meal_type == "snack" else rng.choice([1, 2, 2])
            chosen = rng.sample(options, k=min(n_items, len(options)))
            eats_out = meal_type in ("lunch", "dinner") and rng.random() < 0.4
            location = rng.choice(EAT_OUT_LOCATIONS)["name"] if eats_out else "Home"
            source = rng.choice(["phone", "phone", "glasses"])
            meals.append(_build_meal(rng, _rand_time(rng, day, meal_type), meal_type, chosen, location, source))

    meals.sort(key=lambda m: m["eaten_at"])
    return meals
