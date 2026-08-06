# Morsel — Technical Deep Dive

A complete reference to how the app is built: **how data is stored** and **how the
AI reads it back**. If you read one document to understand the whole system, this
is it. It's written to be exhaustive — skim the table of contents and jump.

- [1. What Morsel is](#1-what-morsel-is)
- [2. System architecture](#2-system-architecture)
- [3. The two flows at a glance](#3-the-two-flows-at-a-glance)
- [4. Storing data — the write path](#4-storing-data--the-write-path)
  - [4.1 The database & why Postgres+pgvector](#41-the-database--why-postgrespgvector)
  - [4.2 The schema, table by table](#42-the-schema-table-by-table)
  - [4.3 Embeddings — what, where, why](#43-embeddings--what-where-why)
  - [4.4 Security: RLS + the two roles](#44-security-rls--the-two-roles)
  - [4.5 Walkthrough: a meal, from photo to rows](#45-walkthrough-a-meal-from-photo-to-rows)
  - [4.6 Nutrition resolution & entity resolution](#46-nutrition-resolution--entity-resolution)
- [5. How the AI reads it — the query path](#5-how-the-ai-reads-it--the-query-path)
  - [5.1 The LangGraph router](#51-the-langgraph-router)
  - [5.2 Aggregate path: text-to-SQL + safety](#52-aggregate-path-text-to-sql--safety)
  - [5.3 Semantic path: pgvector + full-text + RRF](#53-semantic-path-pgvector--full-text--rrf)
  - [5.4 Hybrid path: decomposition](#54-hybrid-path-decomposition)
  - [5.5 Synthesis](#55-synthesis)
- [6. The LLM boundary (provider-agnostic)](#6-the-llm-boundary-provider-agnostic)
- [7. Profile → calorie goal & nutrient targets](#7-profile--calorie-goal--nutrient-targets)
- [8. Insights / advice engine](#8-insights--advice-engine)
- [9. Evaluation harness](#9-evaluation-harness)
- [10. API surface](#10-api-surface)
- [11. Configuration & secrets](#11-configuration--secrets)
- [12. Repository map (file by file)](#12-repository-map-file-by-file)
- [13. Data lifecycle](#13-data-lifecycle)
- [14. Extending the system](#14-extending-the-system)
- [15. Honest limitations](#15-honest-limitations)

---

## 1. What Morsel is

A private, personal **food-memory** system. You capture a meal (a photo and/or a
short note), the app turns it into a **structured, nutrition-resolved record**,
tracks it against a **personalized daily calorie goal**, and lets you **ask your
history questions in natural language** — routing each question to the right
retrieval strategy.

The demo domain is food; the engineering flex is the **memory + dual-query
retrieval** layer and the **hardened text-to-SQL**. There are three surfaces
(backend, web, mobile) over one backend.

Design principles baked in:
- **One store serves both query shapes** — analytical aggregation *and* semantic recall.
- **The router is the centerpiece** — every answer is tagged aggregate / semantic / hybrid.
- **Provider-agnostic AI** — real LLM when a key is set, deterministic stub otherwise; the app always runs.
- **Neutral tool, not a nagging coach** — logging + recall, never judgmental.

## 2. System architecture

```
┌── Surfaces ───────────────┐      ┌── Backend (FastAPI) ──────────────────────────┐
│  web/   (React + Vite)    │      │  routes  →  services  →  { LLM boundary }      │
│  mobile/(Expo RN)         │─HTTP▶│                          { retrieval graph }   │
│  (phone camera / glasses) │      │                          { nutrition resolve } │
└───────────────────────────┘      └───────────────┬───────────────────────────────┘
                                                    │ psycopg3 (2 roles)
                                          ┌─────────▼──────────┐
                                          │ Postgres + pgvector│  meals, meal_items,
                                          │  (Docker, RLS)     │  food_entities, user_profile
                                          └────────────────────┘
     external: USDA FoodData Central (nutrition) · LLM provider (Gemini/Claude/…)
     local:    fastembed bge-small (384-dim embeddings, in-process, no network)
```

Nothing "runs on the glasses": they're a sensor + thin client. The intelligence
lives in the backend. The mobile app holds the capture session and talks HTTP to
the backend, exactly like the web app.

## 3. The two flows at a glance

**Write (capture):**
```
photo + note ─▶ /capture/analyze ─▶ LLM vision extraction ─▶ nutrition resolution
             ─▶ editable draft (NOT saved) ─▶ user edits ─▶ /meals
             ─▶ persist: meals row + meal_items rows + description embedding
```

**Read (ask):**
```
question ─▶ /query ─▶ LangGraph: classify ─(route)─▶ aggregate | semantic | hybrid ─▶ synthesize ─▶ answer + cited meals
                        text-to-SQL ↑         pgvector + full-text (RRF) ↑
```

Both flows go through the same **LLM boundary** so a provider swap is one env var.

---

## 4. Storing data — the write path

### 4.1 The database & why Postgres+pgvector

One Postgres database (via Docker, `pgvector/pgvector:pg16`) holds **both**:
- **Normalized numeric rows** (`meals`, `meal_items`) — so analytical questions
  ("sum protein this week") are exact SQL aggregates, not LLM guesses.
- **A `vector(384)` embedding + a `tsvector`** on `meals` — so associative
  questions ("that mushroom dish") are similarity search in the *same* store.

This "unified data layer" means a single SQL statement can combine metadata
filters, joins, and vector distance — no syncing between a relational DB and a
separate vector DB.

Extensions (`backend/db/01_extensions.sql`): `vector` (pgvector) and `pg_trgm`
(trigram fuzzy name matching).

### 4.2 The schema, table by table

Full DDL: `backend/db/02_schema.sql`. **Nutrient convention:**
`food_entities` stores values **per 100 g**; `meal_items` and `meals` store
**absolute** values for the logged portion / meal.

The 11-nutrient set carried everywhere: `calories, protein_g, carbs_g, fat_g,
fiber_g, sugar_g, sodium_mg, satfat_g, iron_mg, calcium_mg, potassium_mg`.

**`food_entities`** — canonical foods; doubles as the entity-resolution table *and*
the USDA cache. Global (not per-user), so no RLS.

| column | meaning |
|---|---|
| `id` | identity PK |
| `canonical_name` | resolved food name; `UNIQUE(lower(canonical_name))` |
| `aliases text[]` | alternate names that resolve here |
| `fdc_id` | USDA FoodData Central id when resolved from USDA |
| `source` | `seed` \| `usda` \| `llm` \| `manual` |
| `default_unit`, `default_grams` | grams in one default serving |
| 11 nutrient columns | **per 100 g** |
| `name_embedding vector(384)` | embedding of the name, for similarity resolution |

Indexes: unique lower-name; **GIN trigram** on name; **HNSW** on `name_embedding`.

**`user_profile`** — one row per user; profile inputs + derived targets.

| group | columns |
|---|---|
| profile | `age, sex, height_cm, weight_kg, activity_level, goal_type, goal_rate` |
| calorie | `daily_calorie_target, tdee_estimate` |
| macro targets | `protein_target_g, carb_target_g, fat_target_g` |
| micro targets/limits | `fiber_target_g, sugar_limit_g, sodium_limit_mg, satfat_limit_g, iron_target_mg, calcium_target_mg, potassium_target_mg` |
| meta | `target_source` (`llm`\|`formula`), `rationale`, `onboarded`, `updated_at` |

**`meals`** — one row per logged meal. Absolute `total_*` nutrient columns **plus**
the two semantic-search columns.

| column | meaning |
|---|---|
| `id` (text), `user_id` | PK, owner |
| `eaten_at timestamp` | **naive local wall-clock** (no timezone — see §15 note) |
| `meal_type` | breakfast\|lunch\|dinner\|snack |
| `location_text`, `photo_uri`, `note_text` | context |
| `description` | concatenated text ("Lunch at Bangkok Corner: Pad Thai.") — **this is what gets embedded** |
| `tags text[]`, `source`, `confidence` | derived tags, capture source, extraction confidence |
| `total_* (×11)` | absolute nutrient totals, summed from items |
| `embedding vector(384)` | embedding of `description` |
| `description_tsv tsvector` | **generated** from description+location+note (`to_tsvector('english')`) |

Indexes: btree `(user_id, eaten_at DESC)`; **GIN** on `description_tsv`; **HNSW** on `embedding`.

> Gotcha encoded in the schema: the generated `tsvector` uses
> `to_tsvector('english'::regconfig, …)` and omits `tags` — because
> `array_to_string` is only `STABLE`, and generated columns require `IMMUTABLE`.

**`meal_items`** — one row per food item; absolute nutrition for the portion. This
normalized child table is what makes aggregation accurate.

| column | meaning |
|---|---|
| `id`, `meal_id → meals` (cascade), `user_id` | PK, parent, owner (denormalized for RLS) |
| `food_entity_id → food_entities` | canonical link (nullable if unresolved) |
| `raw_name`, `canonical_name` | what was said vs. the resolved name |
| `quantity`, `unit`, `grams` | portion; `grams` is what nutrition scales by |
| 11 nutrient columns | **absolute** for this item |
| `confidence` | per-item extraction confidence |

### 4.3 Embeddings — what, where, why

- Model: **`BAAI/bge-small-en-v1.5`** via **`fastembed`** (ONNX runtime, **no torch,
  no network, no API key**) — `backend/app/embeddings.py`. Lazy-loaded, cached.
- Dimensions: **384** (well under pgvector's 2000 limit).
- Where stored:
  - `meals.embedding` = embedding of `meals.description` (meal-level semantic recall).
  - `food_entities.name_embedding` = embedding of the food name (entity resolution).
- Index: **HNSW** (`vector_cosine_ops`, `m=16, ef_construction=64`) — the right
  choice for a small, write-active corpus (95%+ recall, absorbs inserts, no rebuilds).
- Passing vectors to SQL: formatted as the `'[f,f,…]'::vector` literal (our own
  floats, still passed as a bound parameter) — see `retrieval._vec_literal`.

### 4.4 Security: RLS + the two roles

Two Postgres roles (`backend/db/03_roles.sql`):
- **`morsel_app`** — read/write; used by ingestion and normal reads.
- **`morsel_ro`** — **SELECT-only**; used *exclusively* to run LLM-generated SQL.
  Has no write grants, `default_transaction_read_only=on`, and `statement_timeout=5s`.
  `REVOKE CREATE ON SCHEMA public FROM PUBLIC` blocks table creation too.

**Row-Level Security** (`FORCE`) on `meals`, `meal_items`, `user_profile`. Every
policy is `USING (user_id = current_setting('app.current_user_id', true))`. The app
sets that GUC **per transaction** via a parameterized `set_config(...)`
(`backend/app/db.py` → `app_tx` / `run_readonly_sql`). Net effect: even a generated
query that "forgets" its `WHERE user_id=…` can only ever see the current user's rows.

> This is the security spine of the text-to-SQL story. It's real and tested
> (`backend/tests/`, and a live check confirmed `morsel_ro` raises
> `ReadOnlySqlTransaction` on any write, and RLS hides other users' rows).

### 4.5 Walkthrough: a meal, from photo to rows

`POST /capture/analyze` (multipart photo + note) → `capture_service.analyze`:
1. **Extract** (`llm/extract.py`): the photo + note go to the LLM (vision, structured
   output) → `{ items:[{name, quantity, unit, estimated_grams, +rough macros}], meal_type,
   location, description, confidence }`. No key? A keyword matcher on the note
   produces the same shape (stub).
2. **Resolve** each item (`nutrition/resolve.py`) → real nutrition (see §4.6).
3. **Total** across items → the 11 `total_*` values; build tags + description.
4. Return an **editable draft** — *nothing is written yet*.

User edits names/quantities, then `POST /meals` → `capture_service.build_meal`
re-resolves the (possibly edited) items server-side and `repo.persist_meal`:
- embeds `description` → `meals.embedding`,
- inserts one `meals` row + N `meal_items` rows in one RLS-scoped transaction.

So a burger photo becomes: 1 `meals` row (totals + embedding + tsvector) and, say,
4 `meal_items` rows (patty, cheese, bun, veg), each linked to a `food_entities` row.

### 4.6 Nutrition resolution & entity resolution

`nutrition/resolve.py::resolve_item(name, quantity, unit, grams, fallback)` —
the ADD/UPDATE/NOOP pipeline (per the research doc):

1. **Normalize** the name (lowercase, strip modifiers like "leftover", "some").
2. **Alias/exact match** against `food_entities` → link (NOOP).
3. **Embedding similarity** (HNSW) ≥ threshold (`0.82` cosine) → link (NOOP).
4. **USDA lookup** (`nutrition/usda.py`, FoodData Central) → cache into
   `food_entities` (ADD). Energy is read from id `1008`, falling back to Atwater
   ids `2047/2048`. A **0-kcal USDA match is treated as a miss** (bad match) and
   the model's own estimate is preferred.
5. **Fallback** to the model's per-item estimate, else zeros.
6. **Scale** the resolved per-100 g nutrition by `grams/100` → absolute item values.

Quality gate: **resolutions with 0 kcal are never cached** — caching an empty
lookup would poison every future lookup of that name. They're used ephemerally
(`food_entity_id = NULL`) so the next attempt can retry USDA.

Bundled catalog (`nutrition/seed_foods.py`) pre-populates `food_entities` with ~26
foods (full macros + micros) so **seeding needs zero USDA calls**; novel foods
captured at runtime resolve via USDA.

---

## 5. How the AI reads it — the query path

`POST /query { question }` → `graph.run_query` → a **LangGraph** `StateGraph`
(`backend/app/graph/`). The response shape (stable across providers):
```jsonc
{ "answer", "route": "aggregate|semantic|hybrid", "router_note", "meals": [...], "data": {...}, "sql": "…" }
```

### 5.1 The LangGraph router

```
          ┌─────────────┐   route=aggregate   ┌───────────┐
START ───▶│  classify   │────────────────────▶│ aggregate │──┐
          │  (LLM/stub) │   route=semantic     │  (SQL)    │  │
          └──────┬──────┘──────────────┐       └───────────┘  │
                 │ route=hybrid         ▼                      ▼
                 │              ┌───────────┐             ┌──────────┐
                 └─────────────▶│  hybrid   │────────────▶│synthesize│──▶ END
                                └───────────┘             └──────────┘
                                ┌───────────┐                  ▲
                                │ semantic  │──────────────────┘
                                └───────────┘
```

- **classify** (`llm/classify.py`): returns `route`, an explicit `[start,end]`
  **timeframe** (relative dates normalized *here*, not left to SQL), semantic
  `filters` (location, keywords), and a coarse `metric`. Real LLM or keyword stub.
- Conditional edges dispatch on `route`.
- **synthesize** composes the natural-language answer + citations.

Node names live in `graph/build.py`; node logic in `graph/nodes.py`; typed state
in `graph/state.py`.

### 5.2 Aggregate path: text-to-SQL + safety

`nodes.sql_node`:
1. **Generate SQL** (`llm/sql.py`) grounded on a rich schema doc, with the timeframe
   already resolved to explicit bounds. (Stub mode: a deterministic
   timeframe-summary query — same shape, no LLM.)
2. **Guard** (`app/sql_guard.py`, `sqlglot` AST):
   - exactly one statement; top node must be `SELECT`/`UNION`/CTE;
   - reject any `Insert/Update/Delete/Merge/Create/Drop/Alter/Command/Set` node anywhere;
   - **table allowlist** (`meals, meal_items, food_entities, user_profile`) — blocks `pg_catalog` etc.;
   - **inject a forced `LIMIT`** (wraps the query if needed).
3. **Execute** on the **read-only role** with the RLS GUC set (`db.run_readonly_sql`).
   On any failure it falls back to the deterministic summary template so aggregate
   answers still work.

This is layered defense: the role is DB-enforced and non-bypassable; the AST
validation catches comment/stacked-statement injection that string-matching misses;
RLS scopes rows; the LIMIT caps runaway scans. (Deferred, seams left in code:
EXPLAIN cost gate + one-pass self-correction.)

### 5.3 Semantic path: pgvector + full-text + RRF

`retrieval.semantic_search` runs **one SQL statement** on the read-only role that:
- **dense arm**: `ORDER BY embedding <=> :qvec` (pgvector cosine, HNSW) → top-k ranks;
- **sparse arm**: `description_tsv @@ plainto_tsquery('english', :q)` ranked by `ts_rank` → top-k;
- **fuses** them with **Reciprocal Rank Fusion** (`1/(k+rank)`, k=60) via a `FULL OUTER JOIN`.

RRF works on *ranks*, sidestepping the incompatible scales of cosine distance vs.
`ts_rank`. Location filters (e.g. "near the office" → a set of office-area
locations) and timeframe filters apply in the same SQL. Everything is RLS-scoped.

### 5.4 Hybrid path: decomposition

`nodes.hybrid_node`: run the semantic search **within the resolved timeframe**, then
keep only meals whose description actually contains the content keyword(s), then
aggregate over those matched meals. This answers "how much protein from meals with
chicken this week" = semantic filter (chicken) + time filter (this week) + sum.

### 5.5 Synthesis

`llm/synthesize.py` composes a concise, neutral answer from the tool results (real
LLM), or falls back to deterministic templates. The `router_note` explains how the
question was routed and what the real-system equivalent is — surfaced as a badge in
both UIs.

---

## 6. The LLM boundary (provider-agnostic)

Everything that touches an LLM goes through `backend/app/llm/` so a swap is one env
var. `config._resolve_llm()` maps `LLM_PROVIDER` to `(kind, base_url, model, key)`:

| `LLM_PROVIDER` | kind | notes |
|---|---|---|
| `gemini` | openai-compat | Google AI Studio free tier; base `…/v1beta/openai/`, model `gemini-flash-latest` |
| `anthropic` | anthropic | Claude via the Anthropic SDK |
| `openai`/`groq`/`openrouter`/`ollama`/`vllm` (or any `LLM_BASE_URL`) | openai-compat | one code path for all |
| unset / `off` | stub | deterministic keyword/template/formula |

`llm/client.py` exposes two primitives used by every module:
- `call_tool(system, text, tool_name, schema, photo?, …)` → structured JSON dict.
  - **anthropic**: forced tool-use.
  - **openai-compat**: `response_format={"type":"json_schema", …}` — the portable
    way to get schema-shaped JSON. (Learned the hard way: Gemini's compat endpoint
    *ignores* forced `tool_choice`, and putting the schema in the prompt makes it
    *echo the schema*; a high `max_tokens` floor is needed because Gemini 2.5/3
    Flash spend "thinking" tokens before the JSON; transient `403/429` get retried.)
- `call_text(system, text)` → a plain string.

Both are **defensive**: any error returns `None`, and the caller falls back to its
deterministic stub — so the app runs with or without a key, and degrades gracefully
under a flaky free tier.

Consumers: `extract.py` (vision), `classify.py` (router), `sql.py` (text-to-SQL),
`synthesize.py` (answers), `targets.py` (goal recommendation).

## 7. Profile → calorie goal & nutrient targets

`POST /profile` (age, sex, height, weight, activity, goal) → `llm/targets.py`:
- **Real**: one LLM call returns a daily calorie target + personalized macro/micro
  targets + a short rationale.
- **Fallback**: Mifflin-St Jeor BMR × activity factor for TDEE, adjusted for the
  goal (never < 1200 kcal); protein ~1.6–1.8 g/kg; fiber ~14 g/1000 kcal; sodium
  ≤ 2300 mg; iron/calcium/potassium from standard adult reference intakes.

`GET /stats` compares per-day averages to these targets → **adequacy** rows with a
`status` (`low`/`ok`/`high`/`over`) and `kind` (`target` = hit it, `limit` = stay
under). That drives the dashboard ring + adequacy bars.

## 8. Insights / advice engine

`GET /insights` (`backend/app/insights_service.py`) turns history + targets into a
few **neutral, actionable** suggestions:
- calories vs goal; nutrients you're **low** on (with catalog foods rich in them);
  **limits** you're exceeding (with your biggest sources from `meal_items`); your
  **biggest calorie source** (a swap idea); eating-out pattern.
- Rule-based (always available) + an optional LLM-written one-sentence headline.
- Never judgmental — "a lighter swap frees the most room," not "you ate too much."

## 9. Evaluation harness

`backend/eval/` — 34 hand-labeled questions (`dataset.py`) + a runner (`run.py`)
reporting **router accuracy**, **SQL-execution rate**, **retrieval hit-rate**, and a
confusion matrix. Stub baseline: **71% / 93% / 84%**. Run:
`LLM_PROVIDER=off python -m eval.run` (add `EVAL_DELAY=4` for rate-limited providers).
This is how you prove router quality and catch regressions.

## 10. API surface

Full contract: `API_CONTRACT.md`. Summary:

| method + path | purpose |
|---|---|
| `GET /health` | liveness; shows LLM provider + DB counts |
| `GET/POST /profile` | read / set profile → derives targets |
| `POST /capture/analyze` | photo+note → **editable draft** (no write) |
| `POST /meals` | persist a confirmed/edited draft (items re-resolved) |
| `GET /meals`, `GET /meals/{id}` | list / detail (with items) |
| `POST /query` | the LangGraph router |
| `GET /query/examples` | suggested questions |
| `GET /stats?period=` | dashboard stats + adequacy |
| `GET /insights?period=` | advice engine |
| `POST /admin/reset` | reseed sample data |

## 11. Configuration & secrets

`backend/app/config.py` reads env with dev defaults, and auto-loads a gitignored
`backend/.env` (via `_load_dotenv`, zero-dependency). Keys already present in
`.env`: `USDA_API_KEY`, `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, `LLM_MODEL`.

| var | default | meaning |
|---|---|---|
| `LLM_PROVIDER` | (gemini, from .env) | provider selector (see §6) |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `LLM_API_KEY` | — | provider key |
| `LLM_BASE_URL`, `LLM_MODEL` | provider default | override endpoint/model (e.g. Ollama) |
| `USDA_API_KEY` | `DEMO_KEY` | FoodData Central (real key in .env) |
| `EMBED_MODEL` | `BAAI/bge-small-en-v1.5` | local embeddings |
| `MORSEL_APP_DSN` / `MORSEL_RO_DSN` | localhost:5433 | DB roles |
| `PGPORT` | 5433 | host port for the DB container |

## 12. Repository map (file by file)

```
docker-compose.yml            Postgres + pgvector (host port 5433)
API_CONTRACT.md               the HTTP contract (v2)
docs/                         this deep dive, spec, quickstart, meta-glasses guide
backend/
  db/                         01_extensions / 02_schema / 03_roles .sql
  app/
    config.py                 env + .env loader + LLM resolution + knobs
    db.py                     psycopg3 pools (app + read-only), per-txn RLS GUC
    embeddings.py             fastembed bge-small (384-dim)
    sql_guard.py              sqlglot AST validation + allowlist + forced LIMIT
    retrieval.py              hybrid pgvector + full-text + RRF (one SQL)
    nutrition/                usda.py, resolve.py, seed_foods.py
    llm/                      client.py + extract/classify/sql/synthesize/targets
    graph/                    build.py, nodes.py, state.py (LangGraph router)
    repo.py                   meal + profile persistence/reads (RLS-scoped)
    capture_service.py        analyze (draft) + build_meal (persist)
    stats_service.py          dashboard stats + adequacy
    insights_service.py       advice engine
    sample_data.py, seed.py   deterministic seed generator; seed/reset
    foods.py                  catalog + locations (seed + stub source)
    models.py                 Pydantic contract models
    main.py                   FastAPI app + endpoints (lifespan seeds if empty)
  eval/                       dataset.py, run.py, README.md
  tests/                      golden pytest (guard, classify, targets, resolve, routes)
web/    src/{api.ts, pages/*, components/*, lib/*}    React + Vite
mobile/ src/{api.ts, screens/*, components/*, hooks/*, navigation/*}   Expo RN
```

## 13. Data lifecycle

- **Seed**: on first backend start (empty DB), a `lifespan` hook seeds
  `food_entities` (bundled) + ~87 sample meals generated **relative to today** with a
  fixed random seed (`sample_data.py`) — so "this week" always has data and it's
  reproducible. `POST /admin/reset` reseeds.
- **Capture**: appends real `meals`/`meal_items` (+ any novel `food_entities`).
- **Reset**: `seed.reset()` deletes the user's meals and reseeds (does not touch
  the catalog). The Docker volume persists data across container restarts.

## 14. Extending the system

- **Swap the LLM** (incl. the future self-hosted **vLLM**): set `LLM_PROVIDER` +
  `LLM_BASE_URL`/`LLM_MODEL`/key. No code change — that's the whole point of §6.
  Local, private option today: run Ollama and set `LLM_PROVIDER=ollama`,
  `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=llama3.2`.
- **Add a nutrient**: add the column to `02_schema.sql`, the field lists in
  `nutrition/resolve.py` / `models.py`, and the bundled values in `seed_foods.py`.
- **Grow the eval set**: add cases to `eval/dataset.py`.
- **dbt rollup marts** (deferred): a batch layer building `fct_daily_nutrition` so
  common aggregates hit a pre-computed table.

## 15. Honest limitations

- **USDA matching is ingredient-oriented** — dish names ("quinoa salad") can
  mis-match; real vision extraction breaks a meal into ingredients, which helps.
- **Free-tier LLM keys are intermittent** (rate limits) — calls fall back to stub
  silently. Fine functionally; a steadier key smooths the live demo.
- **Timestamps are naive wall-clock** (`timestamp`, no timezone) by design for a
  single-user personal log; multi-user across timezones would want `timestamptz` +
  per-user tz.
- **Single implicit user** (`user-1`) — the RLS plumbing is real, so multi-user is
  a small addition (auth + a real `user_id`), not a rewrite.
- **Deferred**: EXPLAIN cost gate + SQL self-correction, dbt marts, a re-ranker,
  workout/net-calories, and the Meta-glasses native integration (see
  `docs/META_GLASSES.md`).
