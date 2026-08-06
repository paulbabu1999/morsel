"""Assemble and run the LangGraph StateGraph.

  classify ──(conditional on route)──► sql | semantic | hybrid ──► synthesize
"""

from __future__ import annotations

from datetime import datetime

from langgraph.graph import END, START, StateGraph

from .. import config
from .nodes import classify_node, hybrid_node, semantic_node, sql_node, synthesize_node
from .state import GraphState

_graph = None


def build_graph():
    g = StateGraph(GraphState)
    g.add_node("classify", classify_node)
    g.add_node("aggregate", sql_node)
    g.add_node("semantic", semantic_node)
    g.add_node("hybrid", hybrid_node)
    g.add_node("synthesize", synthesize_node)

    g.add_edge(START, "classify")
    g.add_conditional_edges(
        "classify",
        lambda s: s["route"],
        {"aggregate": "aggregate", "semantic": "semantic", "hybrid": "hybrid"},
    )
    for node in ("aggregate", "semantic", "hybrid"):
        g.add_edge(node, "synthesize")
    g.add_edge("synthesize", END)
    return g.compile()


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_query(question: str, user_id: str = config.DEFAULT_USER_ID) -> dict:
    """Run the router end to end and return a QueryResponse-shaped dict."""
    final = _get_graph().invoke(
        {"question": question, "user_id": user_id, "now": datetime.now()}
    )
    return {
        "question": question,
        "answer": final.get("answer", ""),
        "route": final.get("route", "aggregate"),
        "router_note": final.get("router_note", ""),
        "meals": final.get("meals", []),
        "data": final.get("data", {}),
        "sql": final.get("sql"),
    }
