import os

# Force deterministic stub mode for tests, regardless of .env (so the suite
# never depends on a live/flaky LLM provider). Must run before app.config loads.
os.environ["LLM_PROVIDER"] = "off"

import pytest  # noqa: E402

from app import db, seed  # noqa: E402


@pytest.fixture(scope="session")
def db_ready():
    """Ensure Postgres is reachable and seeded; skip DB tests otherwise."""
    h = db.healthcheck()
    if not h.get("connected"):
        pytest.skip(f"Postgres not available: {h.get('error')}")
    if not h.get("meals"):
        seed.seed_all()
    yield
