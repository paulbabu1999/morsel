# Hosting — Morsel (live, all free tier)

The app is deployed and public:

| Layer | Service | URL |
|---|---|---|
| **Web** | Cloudflare Pages | **https://morsel-7yy.pages.dev** |
| **Backend API** | Render (free web service) | **https://morsel-api-9s89.onrender.com** |
| **Database** | Neon (Postgres + pgvector) | `ep-green-wave-awkasu7c…us-east-1.aws.neon.tech` |
| **LLM + embeddings** | Google Gemini (free) | `gemini-flash-latest` · `gemini-embedding-001` (768-dim) |
| **Nutrition** | USDA FoodData Central | — |

All free, no credit card. Sign in / create an account on the web URL.

## Architecture note (why this shape)

Render's free tier is 512 MB RAM — too small for the local ONNX embedding model.
So the **hosted backend uses `EMBED_PROVIDER=gemini`** (API embeddings, 768-dim) and
installs `requirements-hosted.txt` (no fastembed/onnxruntime). Local dev keeps
`EMBED_PROVIDER=local` (fastembed, 384-dim). The DB vector dimension differs per
deployment (Neon = 768, local Docker = 384), which is fine — separate databases.

Render free also **spins down after ~15 min idle** → the first request cold-starts
(~30–60 s). Neon **auto-suspends** similarly.

## Backend env vars (set on the Render service)

Secrets live in the gitignored `backend/.env.hosting` locally and in Render's env:

```
MORSEL_APP_DSN   = postgres URL for neondb_owner (read/write)
MORSEL_RO_DSN    = postgres URL for morsel_ro   (read-only, for text-to-SQL)
JWT_SECRET       = long random string
LLM_PROVIDER=gemini   LLM_MODEL=gemini-flash-latest
EMBED_PROVIDER=gemini EMBED_MODEL=gemini-embedding-001 EMBED_DIM=768
GEMINI_API_KEY   USDA_API_KEY   SEED_ON_SIGNUP=1   PYTHON_VERSION=3.11.9
```

## Redeploying

- **Backend**: `git push origin main` → Render auto-deploys (`autoDeploy: yes`). Or
  trigger via the Render dashboard / API.
- **Web**: rebuild + upload to Cloudflare Pages:
  ```bash
  cd web && VITE_API_URL="https://morsel-api-9s89.onrender.com" npm run build
  CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
    npx wrangler pages deploy dist --project-name=morsel --branch=main --commit-dirty=true
  ```
  (`VITE_API_URL` is baked in at build time.)

## Neon setup (one-time, already done)

`deploy/neon_setup.sql` = extensions + schema (vector **768**) + the read-only role.
Applied with:
```bash
# replace MORSEL_RO_PW with a real secret first (kept out of git)
psql "postgres://neondb_owner:…@…neon.tech/neondb?sslmode=require" -f deploy/neon_setup.sql
```
Roles: app = `neondb_owner` (owner; still under FORCE RLS); `morsel_ro` runs
LLM-generated SQL (SELECT-only, `users` revoked).

## Notes / next

- CORS is open (`*`); auth is JWT so the API is safe to expose. Data is RLS-isolated per user.
- The web app is a **PWA** — "Add to Home Screen" works now that it's on HTTPS.
- A custom domain can be attached in the Cloudflare Pages + Render dashboards later.
- Mobile app: point `mobile/src/config.ts` `API_URL` at the Render URL and it works
  anywhere (once mobile auth is in).
