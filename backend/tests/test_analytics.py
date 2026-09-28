"""Owner analytics: role-security invariants, best-effort event logging, and the
aggregate service. Runs against the real local DB (LLM stubbed) via conftest.
"""

import psycopg
import pytest

from app import analytics_service, config, db, repo


# --- role / RLS security invariants ----------------------------------------

def test_analytics_role_sees_all_users(analytics_factory):
    """BYPASSRLS: the analytics role aggregates across users (no GUC)."""
    u1 = analytics_factory.make_user()
    u2 = analytics_factory.make_user()
    analytics_factory.add_meal(u1)
    analytics_factory.add_meal(u2)
    rows = db.run_analytics_sql(
        "SELECT count(DISTINCT user_id) AS n FROM meals WHERE user_id = ANY(%(ids)s)",
        {"ids": [u1, u2]},
    )
    assert rows[0]["n"] == 2  # both users' rows visible cross-user


def test_llm_ro_role_cannot_read_events(db_ready):
    """The text-to-SQL role must never reach behavioral telemetry."""
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with psycopg.connect(config.RO_DSN) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM events")


def test_analytics_role_is_read_only(db_ready):
    """The analytics role can never write (read-only txn + SELECT-only grants)."""
    with pytest.raises(
        (psycopg.errors.InsufficientPrivilege, psycopg.errors.ReadOnlySqlTransaction)
    ):
        with psycopg.connect(config.ANALYTICS_DSN) as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO events (event) VALUES ('hack')")
            conn.commit()


def test_analytics_role_cannot_read_password_hash(db_ready):
    """Column-level grant keeps password_hash unreachable to the analytics role."""
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with psycopg.connect(config.ANALYTICS_DSN) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT password_hash FROM users LIMIT 1")
                cur.fetchall()


# --- best-effort event logging ---------------------------------------------

def test_log_event_inserts_a_row(analytics_factory):
    uid = analytics_factory.make_user()
    before = db.run_analytics_sql(
        "SELECT count(*) AS n FROM events WHERE user_id = %(u)s", {"u": uid}
    )[0]["n"]
    repo.log_event("app_open", uid, platform="web", props={"a": 1})
    after = db.run_analytics_sql(
        "SELECT count(*) AS n FROM events WHERE user_id = %(u)s", {"u": uid}
    )[0]["n"]
    assert after == before + 1


def test_log_event_never_raises(monkeypatch):
    """Telemetry must never break a request, even if the DB is unreachable."""
    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(db, "app_pool", boom)
    repo.log_event("app_open", "whoever", props={"x": 1})  # must not raise


def test_safe_props_caps_and_flattens():
    big = {f"k{i}": i for i in range(100)}
    out = repo._safe_props(big)
    assert len(out) <= repo._MAX_PROP_KEYS
    mixed = repo._safe_props({"nested": {"y": 1}, "long": "z" * 1000, "ok": True, "n": 3})
    assert isinstance(mixed["nested"], str)          # nested coerced to string
    assert len(mixed["long"]) <= repo._MAX_PROP_STR  # long string truncated
    assert mixed["ok"] is True and mixed["n"] == 3   # scalars preserved


# --- aggregate service -----------------------------------------------------

def test_overview_counts_move_with_data(analytics_factory):
    base = analytics_service.compute_overview()
    assert base["db_size_mb"] > 0
    assert "weekly_active_loggers" in base

    uid = analytics_factory.make_user()
    analytics_factory.add_meal(uid)
    after = analytics_service.compute_overview()
    assert after["total_users"] >= base["total_users"] + 1
    assert after["total_meals"] >= base["total_meals"] + 1
    assert after["weekly_active_loggers"] >= 1


def test_growth_has_one_row_per_day(analytics_factory):
    g = analytics_service.compute_growth(days=7, tz_offset_min=0)
    assert g["days"] == 7 and len(g["by_day"]) == 7
    d = g["by_day"][0]
    assert {"date", "signups", "cumulative_users", "active_loggers", "meals"} <= set(d)
    # cumulative users is monotonically non-decreasing
    cums = [row["cumulative_users"] for row in g["by_day"]]
    assert cums == sorted(cums)


def test_retention_grid_shape(analytics_factory):
    analytics_factory.make_user()  # ensures at least one cohort exists
    r = analytics_service.compute_retention(weeks=4)
    assert r["weeks"] == 4
    for c in r["cohorts"]:
        assert len(c["retained"]) == 5          # weeks + 1
        assert c["retained"][0] <= c["size"]    # week-0 retained can't exceed cohort size


def test_system_reflects_events_and_quality(analytics_factory):
    uid = analytics_factory.make_user()
    analytics_factory.add_event(
        uid, "query_asked", duration_ms=123, props={"route": "aggregate", "ok": True, "llm": "stub"}
    )
    sysm = analytics_service.compute_system(days=7)
    assert sysm["llm_calls"] >= 1
    assert 0.0 <= sysm["llm_fallback_rate"] <= 1.0
    assert "catalog_composition" in sysm
    assert isinstance(sysm["events_by_day"], list)


def test_outcomes_shape(analytics_factory):
    o = analytics_service.compute_outcomes()
    assert "goal_distribution" in o
    assert "weight_30d" in o and "weight_90d" in o
    assert 0.0 <= o["calorie_adherence"] <= 1.0
    assert 0.0 <= o["protein_adherence"] <= 1.0
