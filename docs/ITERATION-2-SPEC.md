# Iteration 2 Spec — Real Agentic Memory + Storage (Calorie & Nutrition focus)

## Context

Iteration 1 shipped the full app surface (FastAPI backend, React web, Expo mobile) with the two
hard cores **intentionally stubbed**: the "agentic memory" (LLM router, text‑to‑SQL, vector search)
and "data storage" (Postgres + pgvector). Everything ran on an in‑memory keyword stub behind a
stable API contract.

This iteration **replaces both stubs with the real engine**, and reframes the product around
**calorie intake with nutrition awareness** ("am I getting enough nutrients?"). The portfolio goal is
unchanged: demonstrate dual‑query agentic retrieval (aggregate SQL vs. semantic vector vs. hybrid) and
hardened text‑to‑SQL — the engineering the research doc (`compass_artifact…md`) is about. The daily
calorie **goal** is in scope (with a progress ring); workout‑burn and the insights/advice engine are
deferred but the schema is designed so they slot in.

### Decisions locked (via Q&A)

| Area | Decision |
|---|---|
| Scope | Real engine + essential calorie/nutrition UI. **All three surfaces (backend, web, mobile) to parity.** |
| Nutrition depth | Calories + macros (P/C/F) + key micros: **fiber, sugar, sodium, saturated fat, iron, calcium, potassium** |
| Nutrition numbers | **Hybrid**: Claude vision identifies foods + portions → **USDA FoodData Central** lookup for real nutrition |
| USDA sourcing | **Live API + local cache** in `food_entities` (DEMO_KEY for dev); cache doubles as the canonical‑entity table |
| LLM access | **Real Claude when `ANTHROPIC_API_KEY` set, else keyword‑stub fallback** (app always runs) |
| Embeddings | **Local** `bge-small-en-v1.5` (384‑dim) via `fastembed` (ONNX, no torch); HNSW index |
| Postgres | **Docker Compose** (`pgvector/pgvector` image) |
| Orchestration | **LangGraph** — explicit classifier node + conditional edges → tool nodes → synthesis |
| Router style | **Explicit classifier node** (classify + temporal‑normalize + decompose), not tool‑selection |
| Users | **Single implicit user, real RLS plumbing** (user_id, FORCE RLS, read‑only role, per‑txn GUC) |
| SQL safety | **Lean set** (reconciling "minimal" + RLS): read‑only role (+`statement_timeout`), `sqlglot` AST validation, forced `LIMIT`, RLS/FORCE. *Deferred:* EXPLAIN cost gate, self‑correction pass |
| Portions | **Claude estimates, user edits before save** (two‑step capture: analyze → confirm) |
| Calorie goal + targets | Collect profile (age, sex, height, weight, activity, goal) → **single backend Claude call** returns daily calorie target + **personalized** nutrient targets; deterministic fallback (Mifflin‑St Jeor + FDA DV) |
| Seed data | **Migrate + enrich** the existing ~91 sample meals into Postgres with real USDA nutrition |
| Eval | **Golden smoke tests** (pytest) for router classification + SQL‑safety guards |

---

## Architecture

```
Capture (photo+note)                Ask (natural language)
   │                                    │
   ▼                                    ▼
POST /capture/analyze              POST /query
   │  Claude vision (structured        │  LangGraph
   │  outputs) → items+portions        │  ┌─────────────┐
   ▼                                   │  │ classify    │ (route + timeframe + decomposition)
 entity resolution ──► food_entities   │  └──┬────┬───┬─┘
   │  (embed name, similarity,         │  agg │ sem│ hybrid
   │   USDA lookup on miss, cache)     │  ┌───▼┐ ┌─▼──┐ (both)
   ▼                                   │  │sql │ │sem │
 editable draft ──► POST /meals ──►    │  │node│ │node│  sql=text-to-SQL (safety layers)
   persist meals + meal_items +        │  └──┬─┘ └─┬──┘  sem=pgvector + FTS, RRF k=60
   description embedding               │     └──┬──┘
                                       │     ┌──▼────┐
   Postgres + pgvector  ◄──────────────┴────►│synth  │ Claude composes answer + citations
   (RLS FORCE, HNSW, GIN)                    └───────┘
```

LLM boundary: a single `app/llm/` interface (`extract_meal`, `classify_query`, `generate_sql`,
`synthesize_answer`, `recommend_targets`). Each function calls Claude when a key is present and falls
back to the current keyword/template logic (ported from `query.py`/`extraction.py`) otherwise.

---

## 1. Data layer — Postgres + pgvector (Docker Compose)

New: `docker-compose.yml` (service `db`, image `pgvector/pgvector:pg16`), `backend/db/schema.sql`
(run via `docker-entrypoint-initdb.d`), `backend/db/roles.sql` (read‑only role).

**Schema (core columns):**
- `user_profile(user_id pk, age, sex, height_cm, weight_kg, activity_level, goal_type, goal_rate,
  daily_calorie_target, protein_target_g, carb_target_g, fat_target_g,
  fiber_target_g, sodium_limit_mg, satfat_limit_g, iron_target_mg, calcium_target_mg, potassium_target_mg,
  target_source ('llm'|'formula'), rationale text, tdee_estimate, updated_at)`
- `meals(id, user_id, eaten_at timestamptz, meal_type, location_text, photo_uri, note_text,
  description text, source, confidence, total_calories, total_protein_g, total_carbs_g, total_fat_g,
  total_fiber_g, total_sugar_g, total_sodium_mg, total_satfat_g,
  embedding vector(384), tsv tsvector GENERATED, created_at)`
- `meal_items(id, meal_id fk, food_entity_id fk null, raw_name, canonical_name, quantity, unit,
  grams, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, satfat_g, confidence)`
- `food_entities(id, canonical_name, aliases text[], fdc_id int null, source, per‑100g nutrient
  columns…, name_embedding vector(384), created_at)`  ← USDA cache + entity‑resolution table

**Indexes:** HNSW on `meals.embedding` and `food_entities.name_embedding` (`m=16, ef_construction=64`);
btree `(user_id, eaten_at)`; GIN on `meals.tsv`.
**RLS:** `ENABLE` + `FORCE ROW LEVEL SECURITY` on `meals`, `meal_items`, `user_profile`;
policy `USING (user_id = current_setting('app.current_user_id', true)::text)`; set per‑transaction via
parameterized `set_config`. Read‑only role `morsel_ro` (SELECT‑only, `default_transaction_read_only`,
`statement_timeout='5s'`, `REVOKE CREATE ON SCHEMA public FROM PUBLIC`). App writes use `morsel_app` role.

DB access via **psycopg3** in `app/db.py` (connection pools for app vs. read‑only roles). No ORM required.

## 2. Nutrition data — USDA FoodData Central

New `app/nutrition/usda.py`: `search_food(name) -> FoodEntity` hits FDC `/foods/search`, maps nutrient
IDs (Energy 1008, Protein 1003, Carb 1005, Fat 1004, Fiber 1079, Sugars 2000, Sodium 1093, SatFat 1258,
Iron 1089, Calcium 1087, Potassium 1092) to our per‑100g columns, upserts into `food_entities`. Key from
`USDA_API_KEY` env (`DEMO_KEY` default). Lookups check the cache (name embedding similarity ≥ threshold)
before calling the API.

## 3. Extraction pipeline (two‑step: analyze → confirm)

- `app/llm/extract.py`: Claude vision **structured outputs** (strict JSON schema) → `items[{name,
  quantity, unit, estimated_grams}]`, `meal_type`, `location`, `description`, `confidence`. Photo bytes
  are actually sent now.
- `app/nutrition/resolve.py`: for each item → normalize name → embed → similarity search
  `food_entities` → hit (link) or miss (USDA lookup → cache) → scale per‑100g nutrition by `grams`
  (ADD/UPDATE/NOOP pattern from the doc). Compute meal totals.
- Fallback (no key): current keyword extractor + the `foods.py` catalog for numbers.

## 4. Embeddings (local)

`app/embeddings.py`: `fastembed.TextEmbedding("BAAI/bge-small-en-v1.5")` (384‑dim, ONNX, CPU). Used for
`meals.embedding` (from `description`), `food_entities.name_embedding`, and query embedding at serve time.

## 5. Retrieval + LangGraph router

New `app/graph/` — `StateGraph` with typed state `{question, user_id, now, route, timeframe, filters,
sub_queries, sql, rows, semantic_hits, answer, citations, error}`:
- **classify** node: Claude (or stub) → `route ∈ {aggregate,semantic,hybrid}`, normalize relative dates
  to explicit `[start,end]`, extract location/other filters, decompose hybrid. Logged.
- conditional edges → **sql_node** / **semantic_node** / both.
- **sql_node**: Claude generates SQL grounded on a rich schema doc → safety pipeline (§6) → execute via
  `morsel_ro` with RLS GUC set → rows.
- **semantic_node**: embed query → pgvector cosine top‑k + Postgres FTS `ts_rank` top‑k → **RRF (k=60)**
  fuse; apply date/location filters and `user_id` in SQL.
- **synthesis** node: Claude composes the NL answer citing meal rows; stub fallback = current templated
  answer. Returns the existing `QueryResponse` shape (`route`, `router_note`, `answer`, `meals`, `data`)
  so the UIs' route badges keep working unchanged.

## 6. Text‑to‑SQL safety (lean set)

`app/sql_guard.py`: (1) `morsel_ro` read‑only role with `statement_timeout`; (2) `sqlglot` AST validation
— parse as postgres, require exactly one statement, top node `Select`/`Union`, reject any
`Insert/Update/Delete/Merge/Create/Drop/Alter/Command` anywhere, table allowlist; (3) inject forced
`LIMIT` via sqlglot; (4) RLS/FORCE + per‑txn `app.current_user_id`. *Deferred:* EXPLAIN cost gate,
one‑pass self‑correction (leave clear TODO seams).

## 7. Profile → calorie goal + nutrient targets

`POST /profile` (age, sex, height_cm, weight_kg, activity_level, goal_type[lose|maintain|gain],
goal_rate). Backend `app/llm/targets.py` makes **one Claude call** → `{daily_calorie_target, macro
targets, micro targets, rationale}`, persisted to `user_profile`. Fallback: Mifflin‑St Jeor BMR ×
activity factor for calories; protein ~1.6 g/kg, fat ~25% kcal, remainder carbs; micros from FDA Daily
Values. `GET /profile` returns it. Adequacy = per‑nutrient % of target with low/ok/high flags.

## 8. API changes

New/changed (contract update in `API_CONTRACT.md`):
- `POST /profile`, `GET /profile` — **new**
- `POST /capture/analyze` — returns an **unsaved draft** meal (no DB write)
- `POST /meals` — **new**, persists a confirmed (possibly edited) meal
- `GET /stats` — add `targets`, nutrient totals, and adequacy flags
- `GET /meals`, `GET /meals/{id}` — same shape + new nutrient fields
- `POST /query`, `GET /query/examples` — unchanged interface (now real)
- `POST /admin/reset` — reseed Postgres from the enriched sample data

## 9. Frontend — web + mobile parity

- **Profile/Onboarding** screen (new): collect profile → `POST /profile` → show recommended goal +
  targets + rationale.
- **Dashboard**: calorie **ring** (intake vs `daily_calorie_target`), macro bars, key‑micro adequacy
  bars (low/ok/high), goal + TDEE display. Web (`web/src/pages/Dashboard.tsx`) and mobile
  (`mobile/src/screens/Stats.tsx` + a new Profile screen).
- **Capture**: after `analyze`, render the **editable** structured record (items/quantities/macros +
  confidence) → confirm → `POST /meals`. Web `Capture.tsx`, mobile `Capture.tsx`.
- **History / MealDetail**: add nutrient breakdown. **Ask**: unchanged UI, real answers.
- Typed API clients updated: `web/src/api.ts`, `mobile/src/api.ts`.

## 10. Golden smoke tests

`backend/tests/` (pytest): (a) classifier routes ~15 labeled questions to expected route; (b) SQL guard
rejects INSERT/UPDATE/DELETE/DROP/multi‑statement and injects LIMIT; (c) entity resolution links known
aliases; (d) target fallback math sanity. Runnable without a key (stub path) and, if a key is present,
a couple live‑Claude cases.

---

## File‑level plan

- **New:** `docker-compose.yml`, `backend/db/{schema.sql,roles.sql,seed.py}`, `backend/app/db.py`,
  `backend/app/embeddings.py`, `backend/app/nutrition/{usda.py,resolve.py}`,
  `backend/app/llm/{__init__.py,client.py,extract.py,classify.py,sql.py,synthesize.py,targets.py}`,
  `backend/app/graph/{state.py,build.py,nodes.py}`, `backend/app/sql_guard.py`, `backend/tests/…`,
  `backend/app/routers/{profile.py,meals.py}`.
- **Modified:** `backend/app/main.py` (wire new routers/endpoints), `backend/app/models.py` (nutrient
  fields, profile, draft), `backend/requirements.txt` (langgraph, psycopg[binary], sqlglot, fastembed,
  anthropic, httpx), `backend/app/query.py`/`extraction.py` (become the stub‑fallback implementations),
  `API_CONTRACT.md`, `README.md`.
- **Frontend:** modify `web/src/{api.ts,pages/*}`, add web Profile page; modify
  `mobile/src/{api.ts,screens/*}`, add mobile Profile screen.
- **Reused:** existing `foods.py` catalog (fallback numbers + seed), `store.py` seed generator (adapted
  to write Postgres), current UI design systems and route‑badge components.

## Verification (end‑to‑end)

1. `docker compose up -d db` → schema + roles auto‑applied.
2. `cd backend && ./run.sh` (installs deps, runs migrations if needed, seeds enriched sample meals).
3. `pytest backend/tests` → golden tests green (stub path).
4. Web via preview (`morsel-web`): onboarding → dashboard ring fills; capture a photo/note → edit draft →
   save → appears in History with nutrients; Ask "protein this week" (aggregate), "that mushroom dish"
   (semantic), "protein from chicken meals this week" (hybrid) → correct route badges + cited meals.
   With `ANTHROPIC_API_KEY` set, answers are real Claude; without, stub answers. Check console + network.
5. Backend proof: `curl /health`, `/stats` (targets + adequacy), a `/query` of each route.
6. Mobile: `npx tsc --noEmit` clean, `npx expo-doctor`; smoke the Profile + Capture + Stats screens.

## Deferred (explicitly out of scope)

Workout / calories‑burned; insights/advice engine ("small change to cut calories"); EXPLAIN cost gate +
SQL self‑correction; vLLM migration; dbt rollup marts; cross‑encoder re‑ranker; multi‑user auth. Schema
and the LLM interface are shaped so each slots in without rework.

## Assumptions

- You have an `ANTHROPIC_API_KEY` for the real path; the stub fallback covers no‑key runs and demos.
- Docker Desktop is available for the Postgres container.
- USDA `DEMO_KEY` is fine for dev (low rate limit); a free personal key is a drop‑in env change.
- Single implicit `user-1`; the RLS plumbing is real so multi‑user is a later, small addition.
