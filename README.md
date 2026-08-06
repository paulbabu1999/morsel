# Morsel — Agentic Food-Memory + Nutrition

A private, personal **food-memory** system: capture a meal (photo + a spoken/typed
note), get a **structured, nutrition-resolved record**, track intake against a
**personalized daily calorie goal**, and **ask your history questions in natural
language** — watching the system route each question to the right retrieval
strategy.

> Demoed on food capture through AI glasses (Ray-Ban Meta) / phone camera, but the
> real flex is the **memory + dual-query retrieval** and **text-to-SQL safety**
> underneath.

**Iteration 2 replaces the stubs with the real engine.** Iteration 1 shipped the
full app surface (mobile, web, backend) on an in-memory sample store with keyword
heuristics. This iteration builds the two hard cores for real, and reframes the
product around **calorie intake with nutrition awareness**.

## What's real now

| Piece | Status |
|---|---|
| **Storage** — Postgres + pgvector (Docker), normalized `meals`/`meal_items`, HNSW + GIN, **RLS (FORCE) + read-only role** | ✅ Real |
| **Retrieval** — **LangGraph** router: classify → aggregate (text-to-SQL) / semantic (pgvector + full-text, **RRF k=60**) / hybrid | ✅ Real |
| **Text-to-SQL safety** — read-only role + `sqlglot` AST validation + table allowlist + forced LIMIT + RLS | ✅ Real |
| **Extraction** — Claude vision (structured tool-use) → **USDA FoodData Central** nutrition, cached in `food_entities` | ✅ Real (+ stub fallback) |
| **Nutrition** — calories + macros + key micros (fiber, sugar, sodium, sat-fat, iron, calcium, potassium) | ✅ Real |
| **Calorie goal + targets** — profile → single Claude call (or Mifflin-St Jeor + DV fallback) → personalized targets + adequacy | ✅ Real |
| **Embeddings** — local `bge-small-en-v1.5` via `fastembed` (ONNX, no torch, no key) | ✅ Real |
| Web + mobile — profile onboarding, calorie ring, macro/micro adequacy, editable capture | ✅ Real |

**LLM boundary:** everything that uses Claude (extraction, classification,
text-to-SQL, synthesis, target recommendation) runs real Claude when
`ANTHROPIC_API_KEY` is set, and falls back to deterministic keyword/template/formula
stubs otherwise — **so the whole app runs with or without a key**. This is the one
seam the planned self-hosted vLLM migration swaps.

## Surfaces & distribution (intended design)

Web and native are **kept as parallel surfaces** over one backend — not either/or.
Same API, same data; pick the surface per user.

| Surface | For | Notes |
|---|---|---|
| **Web app** (`web/`) | Anyone, zero install | Full feature parity. Also a **PWA** (add-to-home-screen, offline app shell) — an installable *feel* with no app store. Shareable by link once the backend is hosted. |
| **Android app** (`mobile/`) | Native install + **the base the Meta glasses require** | Same features; the glasses' Wearables SDK is native-only, so a web page can't hold the glasses session. Phone camera works today; glasses slot into the existing capture-source abstraction later. |
| **iOS app** (`mobile/`, later) | Optional | Same React Native codebase. |

The native app exists chiefly to enable **hands-free glasses capture** (the project's
differentiator). For plain phone use, the web app / PWA is sufficient. See
`docs/META_GLASSES.md`.

Deferred (schema/interfaces designed for them): workout / calories-burned, an
insights/advice engine, EXPLAIN cost gate + SQL self-correction, dbt rollup marts,
a cross-encoder re-ranker, multi-user auth. See `docs/ITERATION-2-SPEC.md`.

## Architecture

```
Project-diet/
├── docker-compose.yml       ← Postgres + pgvector (host port 5433)
├── API_CONTRACT.md          ← v2 contract both frontends target
├── docs/ITERATION-2-SPEC.md ← the approved iteration-2 spec
├── backend/
│   ├── db/                  ← schema.sql, roles.sql (read-only role), extensions
│   └── app/
│       ├── db.py, config.py, embeddings.py, sql_guard.py, retrieval.py
│       ├── nutrition/ (usda, resolve, seed_foods)   ← entity resolution + USDA
│       ├── llm/ (extract, classify, sql, synthesize, targets, client)  ← Claude + stubs
│       ├── graph/ (build, nodes, state)             ← LangGraph router
│       ├── repo.py, capture_service.py, stats_service.py, seed.py
│       └── main.py
├── web/                     ← Vite + React + TypeScript
└── mobile/                  ← Expo + React Native + TypeScript
```

```
Capture (photo+note) ──► /capture/analyze ─► Claude vision → USDA resolution
   → editable draft ──► /meals ─► meals + meal_items + description embedding

Ask ──► /query ─► LangGraph:  classify ─(route)─► aggregate | semantic | hybrid ─► synthesize
                              text-to-SQL↑          pgvector + FTS (RRF)↑
   (aggregate SQL runs on the read-only role, AST-validated + LIMIT-capped, under RLS)
```

Every `POST /query` answer is tagged with a **route** badge (aggregate / semantic /
hybrid) plus a `router_note` explaining the decision — the dual-query router is the
centerpiece.

## Documentation

- **[docs/QUICKSTART.md](docs/QUICKSTART.md)** — install & use, start to finish (read this first).
- **[docs/TECHNICAL_DEEP_DIVE.md](docs/TECHNICAL_DEEP_DIVE.md)** — how data is stored and how the AI reads it (the complete reference).
- **[docs/META_GLASSES.md](docs/META_GLASSES.md)** — connecting Ray-Ban Meta glasses (honest, step-by-step).
- **[API_CONTRACT.md](API_CONTRACT.md)** — the HTTP contract · **[docs/ITERATION-2-SPEC.md](docs/ITERATION-2-SPEC.md)** — the build spec.

## Run it

Docker is required (for Postgres + pgvector). See **[docs/QUICKSTART.md](docs/QUICKSTART.md)** for the full path.

### 1. Backend (port 8000, brings up the DB itself)
```bash
cd backend
./run.sh          # docker compose up db, venv + deps, seeds sample data, uvicorn :8000
```
- Docs/playground: http://localhost:8000/docs
- Optional real Claude: `export ANTHROPIC_API_KEY=...` before running (else stub mode).
- Optional real USDA lookups for novel foods: `export USDA_API_KEY=...` (else `DEMO_KEY`).

(Or bring up just the DB manually: `docker compose up -d` from the repo root.)

### 2. Web app (port 5173)
```bash
cd web && npm install && npm run dev     # VITE_API_URL defaults to http://localhost:8000
```

### 3. Mobile app (Expo)
```bash
cd mobile && npm install && npx expo start
```
> On a physical device set the API base URL (see `mobile/src/config.ts`) to your
> machine's LAN IP — `localhost` won't reach your dev machine from a phone.

## Try these questions (the dual-query showcase)
- **Aggregate:** "How much protein did I eat this week?" · "How often did I eat out this week?"
- **Semantic:** "What was that mushroom dish?" · "Show me the meal I had near the office"
- **Hybrid:** "How much protein from meals with chicken this week?"
- **Nutrition:** "Am I getting enough fiber this week?"

## Provenance
Built from the project spec in `paul_linkedin_and_project_chat.md` (the Ray-Ban Meta
agentic personal-memory project) and the architecture research doc
(`compass_artifact…md`). The LinkedIn-overhaul half of the first document is
unrelated to this build.
