"""Evaluation runner.

Runs every labeled case through the real router and reports:
  * router accuracy     — % of questions routed to the correct arm
  * SQL execution rate  — % of aggregate questions whose generated SQL ran and
                          returned a numeric result
  * retrieval hit-rate  — % of semantic/hybrid questions whose top meals contain
                          the expected token

Runs against whatever LLM provider is configured (real Gemini/Claude if a key is
set, else the deterministic stub). Force the stub baseline with:
    LLM_PROVIDER=off python -m eval.run

Usage:  python -m eval.run
"""

from __future__ import annotations

import os
import sys
import time

from app import config
from app.graph import run_query
from .dataset import CASES

# Pace requests for rate-limited free tiers: EVAL_DELAY=4 python -m eval.run
_DELAY = float(os.getenv("EVAL_DELAY", "0"))


def _sql_ok(r: dict) -> bool:
    data = r.get("data") or {}
    numeric = any(isinstance(v, (int, float)) for v in data.values())
    return bool(r.get("sql")) and numeric


def _retrieval_hit(r: dict, token: str | None) -> bool:
    meals = r.get("meals") or []
    if not meals:
        return False
    if token is None:  # location-only queries — a non-empty result is a hit
        return True
    tok = token.lower()
    return any(tok in (m.get("description") or "").lower() for m in meals)


def main() -> int:
    route_correct = 0
    agg_total = agg_sql_ok = 0
    ret_total = ret_hit = 0
    confusion: dict[tuple[str, str], int] = {}
    rows = []

    for case in CASES:
        if _DELAY:
            time.sleep(_DELAY)
        r = run_query(case["q"])
        got = r.get("route")
        exp = case["route"]
        ok = got == exp
        route_correct += ok
        confusion[(exp, got)] = confusion.get((exp, got), 0) + 1

        detail = ""
        if exp == "aggregate":
            agg_total += 1
            good = _sql_ok(r)
            agg_sql_ok += good
            detail = "sql✓" if good else "sql✗"
        else:
            ret_total += 1
            hit = _retrieval_hit(r, case.get("contains"))
            ret_hit += hit
            detail = "hit✓" if hit else "hit✗"

        rows.append((("✓" if ok else "✗"), exp, got or "-", detail, case["q"]))

    n = len(CASES)
    print(f"\n{'':2} {'expected':9} {'got':9} {'check':5} question")
    print("-" * 84)
    for mark, exp, got, detail, q in rows:
        print(f"{mark:2} {exp:9} {got:9} {detail:5} {q[:44]}")

    print("\n" + "=" * 60)
    print(f"provider           : {config.LLM_PROVIDER or config.LLM_KIND} "
          f"({'real' if config.USE_REAL_LLM else 'stub'})")
    print(f"router accuracy    : {route_correct}/{n}  ({100*route_correct/n:.0f}%)")
    if agg_total:
        print(f"SQL execution rate : {agg_sql_ok}/{agg_total}  ({100*agg_sql_ok/agg_total:.0f}%)  [aggregate]")
    if ret_total:
        print(f"retrieval hit-rate : {ret_hit}/{ret_total}  ({100*ret_hit/ret_total:.0f}%)  [semantic+hybrid]")
    print("\nconfusion (expected -> got):")
    for (exp, got), c in sorted(confusion.items()):
        flag = "" if exp == got else "   <-- miss"
        print(f"  {exp:9} -> {got:9} : {c}{flag}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
