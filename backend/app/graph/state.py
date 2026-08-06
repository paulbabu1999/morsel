"""Typed state passed between graph nodes."""

from __future__ import annotations

from datetime import datetime
from typing import Any, TypedDict


class GraphState(TypedDict, total=False):
    # inputs
    question: str
    user_id: str
    now: datetime
    # classify
    plan: dict
    route: str
    # retrieval
    sql: str
    sql_source: str
    data: dict[str, Any]
    meals: list[dict]
    # output
    answer: str
    router_note: str
    error: str
