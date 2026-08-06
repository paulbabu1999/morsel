# Backend — Morsel API

FastAPI backend with **real** Postgres + pgvector storage, a **LangGraph**
dual-query router, Claude vision extraction + USDA nutrition, and local
embeddings. Falls back to deterministic stubs when `ANTHROPIC_API_KEY` is unset,
so it always runs.

## Run

```bash
./run.sh            # docker compose up db → venv+deps → seed on first run → uvicorn :8000
```

Requires Docker (Postgres + pgvector). The script brings the DB up, waits for
health, installs deps, and starts the API (which seeds sample data on first run).

Env (all optional):
- `ANTHROPIC_API_KEY` — real Claude for extraction/router/synthesis/targets (else stub).
- `USDA_API_KEY` — real USDA lookups for novel foods (else `DEMO_KEY`, rate-limited).
- `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`), `EMBED_MODEL` (default `BAAI/bge-small-en-v1.5`).
- DB DSNs `MORSEL_APP_DSN` / `MORSEL_RO_DSN` (defaults match `docker-compose.yml`, host port 5433).

- API: http://localhost:8000 · Swagger: http://localhost:8000/docs
- Tests: `source .venv/bin/activate && pytest tests/` (DB tests skip if Postgres is down).

## Layout

```
db/                 01_extensions.sql, 02_schema.sql (RLS/HNSW/GIN), 03_roles.sql (read-only role)
app/
  config.py         env + knobs (DSNs, model names, RRF k, thresholds)
  db.py             psycopg3 pools (app + read-only), per-txn RLS GUC
  embeddings.py     local bge-small via fastembed (384-dim)
  sql_guard.py      sqlglot AST validation + table allowlist + forced LIMIT
  retrieval.py      hybrid pgvector + full-text search fused with RRF (one SQL)
  nutrition/        usda.py (FDC client), resolve.py (entity resolution), seed_foods.py (bundled)
  llm/              client.py + extract/classify/sql/synthesize/targets (Claude + stub each)
  graph/            LangGraph: build.py, nodes.py (classify→sql|semantic|hybrid→synthesize), state.py
  repo.py           meal + profile persistence/reads (RLS-scoped)
  capture_service.py  analyze (draft) + build_meal (persist)
  stats_service.py  dashboard stats + nutrient adequacy vs targets
  sample_data.py    deterministic seed generator (relative to today)
  seed.py           seed food_entities + meals; reset
  main.py           FastAPI app + endpoints
tests/              golden smoke tests (sql guard, classifier, targets, resolution, routes)
```

## Safety model (text-to-SQL)
LLM-generated SQL runs ONLY on the `morsel_ro` role (SELECT-only, read-only
transaction, `statement_timeout`), after `sql_guard` parses it to an AST and
rejects anything that isn't a single read query over the allowlisted tables, then
injects a `LIMIT`. Row-Level Security (`FORCE`) scopes every row to the current
user via a per-transaction GUC. Deferred: EXPLAIN cost gate + one-pass
self-correction (seams left in `graph/nodes.py`).

Sample data is generated relative to **today** with a fixed seed, so
time-relative queries always have data. `POST /admin/reset` reseeds.
