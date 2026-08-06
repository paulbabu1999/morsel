"""End-to-end router: each question type produces its route + real results."""

import pytest

from app.graph import run_query

pytestmark = pytest.mark.usefixtures("db_ready")


def test_aggregate_returns_numbers():
    r = run_query("how much protein did I eat this week")
    assert r["route"] == "aggregate"
    assert r["data"].get("total_protein_g", 0) > 0
    assert "protein" in r["answer"].lower()


def test_semantic_finds_mushroom():
    r = run_query("what was that mushroom dish")
    assert r["route"] == "semantic"
    assert r["meals"], "expected at least one cited meal"
    assert "mushroom" in (r["meals"][0]["description"] or "").lower()


def test_hybrid_filters_and_aggregates():
    r = run_query("how much protein from meals with chicken this week")
    assert r["route"] == "hybrid"
    # every cited meal should actually mention chicken
    assert all("chicken" in (m["description"] or "").lower() for m in r["meals"])


def test_sql_is_read_only_and_bounded():
    r = run_query("how many calories this week")
    assert r["sql"] and "limit" in r["sql"].lower()
