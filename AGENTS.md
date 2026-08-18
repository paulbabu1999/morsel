# AGENTS.md — Morsel operations & maintenance guide

Entry point for any agent/dev changing this app or fixing bugs. Architecture in
depth: **`docs/TECHNICAL_DEEP_DIVE.md`**. Deploy specifics: **`docs/HOSTING.md`**.
API shapes: **`API_CONTRACT.md`**. This file is the operator's manual.

## What it is
**"Bite"** (the user-facing brand; formerly "Morsel") — a food-memory app. All
UI wordmarks/titles say "Bite". **Infra keeps the old `morsel` names on purpose**:
GitHub repo `morsel`, Render `morsel-api-*`, Cloudflare project `morsel`, Neon,
Expo `scheme: morsel` / `com.morsel.app`. Don't "fix" those to Bite — they're just
identifiers. Capture a meal (photo + note) → structured,
nutrition-resolved record → track vs a personalized calorie goal → ask history in
natural language (a LangGraph router picks aggregate text-to-SQL / semantic
pgvector+FTS / hybrid). Multi-user (email/password → JWT), per-user data isolated
by Postgres Row-Level Security.

## Live deployment (all free tier)
| Part | Service | Where |
|---|---|---|
| Web (React PWA) | **Cloudflare Pages** (project `morsel`) | https://morsel-7yy.pages.dev |
| Backend (FastAPI) | **Render** free (`srv-d9q28vm1egvs73d5rfog`) | https://morsel-api-9s89.onrender.com |
| DB | **Neon** Postgres + pgvector (us-east-1) | see `NEON_SETUP_DSN` |
| LLM + embeddings | **Google Gemini** free | `gemini-flash-lite-latest` (chat/vision), `gemini-embedding-001` (768-dim) |
| Nutrition | **USDA FoodData Central** | — |
| Code | **GitHub** | github.com/paulbabu1999/morsel |

**All secrets + deploy creds are in `backend/.env.hosting` (gitignored)** — Neon
DSNs, JWT secret, Render API key + service id, Cloudflare token + account id, URLs.
Local dev secrets (Gemini/USDA keys) are in `backend/.env` (gitignored). **Never
commit either**; there's a safety-gate step in every commit below.

## Repo layout
```
backend/   FastAPI. app/{auth,db,config,embeddings,sql_guard,retrieval,repo,
           capture_service,stats_service,insights_service,seed,sample_data,main}.py
           app/nutrition/{usda,resolve,seed_foods}  app/llm/{client,extract,classify,
           sql,synthesize,targets}  app/graph/{build,nodes,state} (LangGraph router)
           db/*.sql (local schema)  eval/  tests/
web/       Vite + React + TS. src/{api.ts, pages/*, components/*, lib/{auth,profile,useAsync}}
mobile/    Expo RN + TS. src/{api.ts, config.ts, auth/*, screens/*, components/*}
deploy/    neon_setup.sql (hosted schema)
docs/      TECHNICAL_DEEP_DIVE, HOSTING, QUICKSTART, META_GLASSES, ITERATION-2-SPEC
```

## Local development
```bash
docker compose up -d                     # Postgres+pgvector on :5433
cd backend && ./run.sh                   # venv + deps + seed + uvicorn :8000  (uses backend/.env, EMBED_PROVIDER=local)
cd web && npm install && npm run dev     # :5173
cd mobile && npm install && npx expo start
```
Tests: `cd backend && source .venv/bin/activate && pytest tests/` · router eval:
`LLM_PROVIDER=off python -m eval.run` · web: `npm run build` / `npx tsc -b` ·
mobile: `npx tsc --noEmit`.

## Making a change & deploying

### Backend  (deploy is MANUAL — Render pulls a public repo URL with no GitHub webhook, so pushing does NOT auto-deploy)
1. Edit `backend/app/**`. Run `pytest tests/`.
2. Commit + push `main`, then **trigger the deploy yourself** (autoDeploy never fires here):
   `curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{"clearCache":"do_not_clear"}' https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys`
   Poll: `curl -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1` until `status:live`.
   (Use `"clearCache":"clear"` only when a dependency changed — e.g. adding Pillow.)
3. Hosted uses `requirements-hosted.txt` (no fastembed) + `EMBED_PROVIDER=gemini`.
   If you add a dependency, add it to BOTH `requirements.txt` and `requirements-hosted.txt`.
4. Change a hosted env var: `PUT /v1/services/$SVC/env-vars/{KEY}` (use curl — macOS system Python's
   urllib has no CA certs). A PUT while a deploy is in-flight is ignored by that deploy — wait for
   `live`, then `POST /deploys`. Mirror the value into `backend/.env.hosting`.

### Web  (manual deploy — Cloudflare Pages is NOT git-connected)
```bash
cd web
VITE_API_URL="$RENDER_URL" npm run build      # API URL is baked at build time
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
  npx wrangler pages deploy dist --project-name=morsel --branch=main --commit-dirty=true
```
(creds are in `backend/.env.hosting`). Then commit + push the source too. SPA routing
relies on `web/public/_redirects`.

### Mobile
Edit `mobile/src/**`, `npx tsc --noEmit`. `API_URL` (`mobile/src/config.ts`) points at
the Render URL. Run in Expo Go (`npx expo start`) or build an APK:
`npx eas-cli build -p android --profile preview` (needs the Expo account; project id in app.json).

### Database schema change (no migration tool — manual SQL, two files kept in sync)
- Edit `backend/db/02_schema.sql` (**local, vector(384)**) AND `deploy/neon_setup.sql`
  (**hosted, vector(768)** — the only structural diff is the embedding dim).
- Local apply: `docker compose down -v && docker compose up -d` (re-runs init) or `ALTER` by hand.
- Neon apply: `docker exec -i morsel-db psql "$NEON_SETUP_DSN" -f -` < your SQL (see HOSTING.md).

## Config / env cheat-sheet
| Var | Local (`backend/.env`) | Hosted (Render / `.env.hosting`) |
|---|---|---|
| `LLM_PROVIDER` / `LLM_MODEL` | gemini / gemini-flash-latest | gemini / **`gemini-flash-lite-latest`** (flash-latest→gemini-3.7-flash is only 20 free req/day; lite has a bigger free quota) |
| `EMBED_PROVIDER` | **local** (fastembed 384) | **gemini** (`gemini-embedding-001`, 768) |
| `EMBED_DIM` | 384 | 768 |
| `MORSEL_APP_DSN` / `MORSEL_RO_DSN` | localhost:5433 roles | Neon **`morsel_app`** (non-bypass!) / `morsel_ro` — NOT `neondb_owner` |
| `JWT_SECRET` | dev default | random secret |
| `SEED_ON_SIGNUP` | 1 (demo data) | **0** (real users start empty) |
| `GEMINI_API_KEY` / `USDA_API_KEY` | real keys | same |

## Auth model
`app/auth.py`: email/password → bcrypt hash + JWT (`current_user_id` dependency).
Every data endpoint takes `user_id = Depends(auth.current_user_id)`; that id is set as
the `app.current_user_id` GUC per transaction (`db.app_tx` / `run_readonly_sql`), so RLS
isolates each user. Public routes: `/health`, `/auth/*`, `/query/examples`.

## Gotchas — read before touching these
- **Embedding provider ↔ column dim must match.** local=384, hosted=768. Never point a
  384-dim app at a 768-dim DB. Local Docker DB and Neon are separate, hence the diff.
- **Gemini structured output**: use `response_format={"type":"json_schema",…}` (NOT
  forced `tool_choice` — Gemini ignores it; NOT schema-in-prompt — it echoes the schema).
  Keep a high `max_tokens` floor (thinking tokens). Models: `gemini-flash-latest`,
  `gemini-embedding-001` (request `outputDimensionality`). See `app/llm/client.py`, `app/embeddings.py`.
- **RLS**: any meal/profile query MUST go through `db.app_tx` / `run_readonly_sql` (sets
  the user GUC). A bare `app_pool` query returns nothing (RLS `FORCE`d). `food_entities`/`users` are global.
- **Neon BYPASSRLS trap (critical)**: Neon's `neondb_owner` has `rolbypassrls=true`, so RLS is
  SKIPPED for it — if `MORSEL_APP_DSN` connects as the owner, **every user sees every user's rows**.
  The app must connect as the dedicated **`morsel_app`** role (`LOGIN NOBYPASSRLS`, granted
  `SELECT,INSERT,UPDATE,DELETE` on the app tables) — that's what makes hosted RLS actually enforce.
  Verify after any DB/role change: a brand-new signup's `GET /meals` must be `[]`. Local Docker's
  `morsel_app` is already non-bypass, so this bug is Neon-only. See `deploy/neon_setup.sql`.
- **text-to-SQL** runs on the read-only `morsel_ro` role via `sql_guard` (single SELECT,
  table allowlist, forced LIMIT); `users` is revoked from it.
- **Timestamps** are naive `timestamp` (no `Z`) = wall clock; clients parse as local.
- **Render free cold-starts** ~30–60s after ~15 min idle. **Neon** auto-suspends too.
  Mobile uses a 30s timeout for auth calls (`AUTH_REQUEST_TIMEOUT_MS`).
- **Neon + pooler**: psycopg prepared statements are disabled (`prepare_threshold=None` in `db.py`).
- **Frontend freshness**: data that depends on the profile (dashboard targets) must key its
  fetch on `profile.updated_at` so a Profile save reflects (see `web/src/pages/Dashboard.tsx`).
- **LLM/USDA are best-effort**: everything falls back to deterministic stubs on error, so the
  app never hard-fails — but a stub answer is not the "real" one.

## Clean / reset the database
```bash
# hosted (wipes all accounts + data, keeps food catalog)
docker exec -i morsel-db psql "$NEON_SETUP_DSN" -c "TRUNCATE users, user_profile, meals, meal_items CASCADE; DELETE FROM food_entities WHERE source<>'seed';"
```
Local: `POST /admin/reset` (authed — resets the current user to seeded sample data).

## Where to look when X breaks
| Symptom | Start here |
|---|---|
| Login/signup fails | `app/auth.py`, `web/src/lib/auth.tsx`, `mobile/src/auth/*` |
| Wrong/zero nutrition on a food | `app/nutrition/{usda,resolve}.py` (energy ids, 0-kcal cache gate) |
| Query routed wrong / bad answer | `app/llm/classify.py`, `app/graph/nodes.py`, `app/llm/synthesize.py` |
| SQL error / injection worry | `app/sql_guard.py`, `app/llm/sql.py` |
| Dashboard stale after edit | `web/src/pages/Dashboard.tsx` (profile.updated_at dep) |
| Hosted embeddings failing | `app/embeddings.py` (`_embed_gemini`), Render `EMBED_*` env |
| Deploy issues | `docs/HOSTING.md`, Render/Cloudflare dashboards, `backend/.env.hosting` |
