# Router evaluation harness

Quantifies the dual-query router on a hand-labeled set (`dataset.py`, 34 cases
across aggregate / semantic / hybrid). Measures:

- **router accuracy** — questions routed to the correct arm
- **SQL execution rate** — aggregate questions whose generated SQL ran and returned a number
- **retrieval hit-rate** — semantic/hybrid questions whose top meals contain the expected token

Plus a confusion matrix (expected → got) that shows *where* the router fails.

## Run

```bash
# deterministic stub baseline (no key, reproducible)
LLM_PROVIDER=off python -m eval.run

# against the configured provider (real Gemini/Claude)
python -m eval.run

# pace requests for a rate-limited free tier (~4s between questions)
EVAL_DELAY=4 python -m eval.run
```

## Baseline (stub, deterministic)

```
router accuracy    : 24/34  (71%)
SQL execution rate : 14/15  (93%)  [aggregate]
retrieval hit-rate : 16/19  (84%)  [semantic+hybrid]
```

The stub's misses are almost entirely **hybrid → aggregate** (it under-detects
the semantic filter in "protein from salmon meals this month") and **semantic →
aggregate** for phrases without trigger words ("that pizza dinner"). A real LLM
classifier is expected to close most of these — the harness is how you prove it,
and how you catch regressions when you change the router.

Grow the set (aim 50–200 cases) and add per-metric SQL-correctness checks as the
system matures.
