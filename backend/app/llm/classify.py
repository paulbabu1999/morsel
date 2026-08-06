"""Query classification + planning (the router's brain).

Produces: route (aggregate/semantic/hybrid), an explicit [start,end] timeframe
(relative dates normalized here, not left to text-to-SQL), semantic filters
(location, keywords), and a coarse metric hint used by the stub SQL templater.

Real: one Claude tool call, given the current timestamp. Stub: keyword + regex
heuristics ported from iteration-1's router.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

from .. import config
from . import client

_AGG_WORDS = [
    "how much", "how many", "how often", "average", "avg", "total", "sum", "count",
    "most", "least", "trend", "per day", "per week", "calories", "protein", "carbs",
    "carb", "fat", "fiber", "sugar", "sodium", "macros", "frequency", "enough",
]
_SEM_WORDS = [
    "that dish", "that meal", "that thing", "the one", "near", "with", "like",
    "remember", "find", "which", "what was", "the place", "restaurant", "tasted",
]
_SEM_STRONG = ["that dish", "that meal", "near the office", "the one with", "what was that"]

_STOPWORDS = {
    "the", "a", "an", "that", "this", "what", "was", "were", "did", "i", "have", "had",
    "eat", "ate", "meal", "dish", "thing", "one", "with", "from", "near", "of", "my",
    "me", "show", "find", "which", "where", "at", "in", "on", "to", "and", "or", "some",
    "again", "remember", "recall", "place", "how", "much", "many", "often",
}

_CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "route": {"type": "string", "enum": ["aggregate", "semantic", "hybrid"]},
        "start": {"type": ["string", "null"], "description": "ISO 8601 lower bound or null"},
        "end": {"type": ["string", "null"], "description": "ISO 8601 upper bound or null"},
        "timeframe_label": {"type": "string"},
        "location": {"type": ["string", "null"]},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "metric": {
            "type": "string",
            "enum": ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium", "eat_out", "count"],
        },
        "reasoning": {"type": "string"},
    },
    "required": ["route", "timeframe_label", "keywords", "metric", "reasoning"],
}


def classify_query(question: str, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    real = _classify_real(question, now)
    if real is not None:
        return real
    return _classify_stub(question, now)


def _classify_real(question: str, now: datetime) -> dict | None:
    system = (
        "Classify a personal food-log question. The current datetime is "
        f"{now.isoformat()}. Choose route=aggregate for numeric/analytical questions "
        "(sums, averages, counts, 'how much protein this week'), route=semantic for "
        "associative recall ('that mushroom dish', 'the place near the office'), and "
        "route=hybrid when both apply. Normalize any relative time expression into "
        "explicit ISO start/end bounds (null if none). Extract a location filter and "
        "content keywords. Pick the single most relevant metric."
    )
    out = client.call_tool(system, question, "classify", _CLASSIFY_SCHEMA, max_tokens=500)
    if not out:
        return None
    return {
        "route": out.get("route", "aggregate"),
        "timeframe": {
            "start": _parse_iso(out.get("start")),
            "end": _parse_iso(out.get("end")),
            "label": out.get("timeframe_label", "recently"),
        },
        "filters": {"location": out.get("location"), "keywords": out.get("keywords", [])},
        "metric": out.get("metric", "calories"),
        "reasoning": out.get("reasoning", ""),
        "classifier": config.LLM_PROVIDER or config.LLM_KIND,
    }


def _parse_iso(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


# --- stub -----------------------------------------------------------------

def _classify_stub(question: str, now: datetime) -> dict:
    q = question.lower().strip()
    has_agg = any(w in q for w in _AGG_WORDS)
    has_sem = any(w in q for w in _SEM_WORDS)
    strong_sem = any(w in q for w in _SEM_STRONG)

    if (strong_sem or has_sem) and has_agg:
        route = "hybrid"
    elif strong_sem or (has_sem and not has_agg):
        route = "semantic"
    else:
        route = "aggregate"

    start, end, label = _resolve_timeframe(q, now)
    location = "office" if ("office" in q or "work" in q) else None
    return {
        "route": route,
        "timeframe": {"start": start, "end": end, "label": label},
        "filters": {"location": location, "keywords": _keywords(q)},
        "metric": _metric(q),
        "reasoning": f"stub heuristic: agg={has_agg} sem={has_sem} strong={strong_sem}",
        "classifier": "stub",
    }


def _resolve_timeframe(q: str, now: datetime):
    day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if "today" in q:
        return day0, now, "today"
    if "yesterday" in q:
        return day0 - timedelta(days=1), day0, "yesterday"
    if "last week" in q:
        return day0 - timedelta(days=14), day0 - timedelta(days=7), "last week"
    if any(p in q for p in ["this week", "past week", "last 7 days"]):
        return day0 - timedelta(days=7), now, "the last 7 days"
    if any(p in q for p in ["this month", "past month", "last 30 days"]):
        return day0 - timedelta(days=30), now, "the last 30 days"
    return day0 - timedelta(days=7), now, "the last 7 days"


def _keywords(q: str) -> list[str]:
    words = re.findall(r"[a-z]+", q.lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 2]


def _metric(q: str) -> str:
    if "protein" in q:
        return "protein"
    if "carb" in q:
        return "carbs"
    if "fiber" in q:
        return "fiber"
    if "sodium" in q or "salt" in q:
        return "sodium"
    if "sugar" in q:
        return "sugar"
    if "fat" in q:
        return "fat"
    if ("how often" in q or "frequency" in q) and ("out" in q or "restaurant" in q):
        return "eat_out"
    if "how many meals" in q or ("count" in q and "meal" in q):
        return "count"
    return "calories"
