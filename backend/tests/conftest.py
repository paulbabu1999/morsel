import os

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
