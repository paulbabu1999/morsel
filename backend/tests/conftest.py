import os
import types
import uuid

# Force deterministic stub mode for tests, regardless of .env (so the suite
# never depends on a live/flaky LLM provider). Must run before app.config loads.
os.environ["LLM_PROVIDER"] = "off"

import pytest  # noqa: E402

from app import db, seed  # noqa: E402


@pytest.fixture(scope="session")
def db_ready():
    """Ensure Postgres is reachable and seeded with CURRENT-week data; skip DB
    tests otherwise.

    Sample meals are generated relative to `today`, so a seed left over from a
    previous week leaves "this week" empty and breaks the aggregate route test.
    Reseed whenever there's no data in the last 7 days (covers both an empty DB
    and a stale one)."""
    h = db.healthcheck()
    if not h.get("connected"):
        pytest.skip(f"Postgres not available: {h.get('error')}")
    if not h.get("meals"):
        seed.seed_all()
        return_yield = True
    else:
        with db.app_tx() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM meals "
                "WHERE eaten_at >= now() - interval '7 days'"
            )
            recent = cur.fetchone()["n"]
        if not recent:
            seed.reset()  # clears the stale seed and regenerates relative to today
    yield


@pytest.fixture
def analytics_factory(db_ready):
    """Create disposable users / meals / events for analytics tests, then clean
    them all up on teardown (so cross-user aggregate assertions stay deterministic
    without depending on the seeded default user)."""
    from app import capture_service, repo

    users: list[str] = []
    meals: list[tuple[str, str]] = []
    event_users: set[str] = set()

    def make_user(email: str | None = None) -> str:
        uid = "test-an-" + uuid.uuid4().hex[:10]
        repo.create_user(uid, email or f"{uid}@bite.test", "x")
        users.append(uid)
        event_users.add(uid)
        return uid

    def add_meal(uid: str, raw_name: str = "apple", **kw) -> str:
        meal = capture_service.build_meal(
            {
                "items": [{"raw_name": raw_name, "quantity": 1, "unit": "medium"}],
                "meal_type": "snack",
                "source": "phone",
                **kw,
            }
        )
        mid = repo.persist_meal(meal, uid)["id"]
        meals.append((mid, uid))
        return mid

    def add_event(uid: str, event: str = "app_open", **kw) -> None:
        repo.log_event(event, uid, **kw)
        event_users.add(uid)

    yield types.SimpleNamespace(make_user=make_user, add_meal=add_meal, add_event=add_event)

    for mid, uid in meals:
        try:
            repo.delete_meal(mid, uid)
        except Exception:
            pass
    try:
        with db.app_pool().connection() as conn:
            with conn.cursor() as cur:
                for uid in event_users:
                    cur.execute("DELETE FROM events WHERE user_id = %s", (uid,))
                for uid in users:
                    cur.execute("DELETE FROM user_profile WHERE user_id = %s", (uid,))
                    cur.execute("DELETE FROM weight_logs WHERE user_id = %s", (uid,))
                    cur.execute("DELETE FROM users WHERE id = %s", (uid,))
            conn.commit()
    except Exception:
        pass
