"""Router classification (stub path) routes questions to the expected arm."""

from datetime import datetime

import pytest

from app.llm.classify import classify_query

NOW = datetime(2026, 7, 27, 20, 0, 0)


@pytest.mark.parametrize(
    "question,expected",
    [
        ("How much protein did I eat this week?", "aggregate"),
        ("How many calories did I have today?", "aggregate"),
        ("How often did I eat out this week?", "aggregate"),
        ("What was that mushroom dish?", "semantic"),
        ("Show me the meal I had near the office", "semantic"),
        ("How much protein from meals with chicken this week?", "hybrid"),
    ],
)
def test_routes(question, expected):
    assert classify_query(question, NOW)["route"] == expected


@pytest.mark.parametrize(
    "question,label",
    [
        ("calories today", "today"),
        ("calories yesterday", "yesterday"),
        ("protein this week", "the last 7 days"),
        ("protein last week", "last week"),
    ],
)
def test_timeframe_normalization(question, label):
    assert classify_query(question, NOW)["timeframe"]["label"] == label


def test_metric_detection():
    assert classify_query("how much protein this week", NOW)["metric"] == "protein"
    assert classify_query("how often did I eat out", NOW)["metric"] == "eat_out"
