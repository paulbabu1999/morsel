# Quickstart — install & use

The app is in a ready state. When you're back, this is the whole path:
**start the backend → run a surface (web or mobile) → (optionally) connect glasses → use it.**
Your keys are already saved in `backend/.env`, and the sample/test data stays.

## Prerequisites (one-time)

- **Docker Desktop** (for Postgres + pgvector) — running.
- **Python 3.10+** and **Node 18+**.
- For the mobile app on a phone: the **Expo Go** app (App Store / Play Store),
  phone on the **same Wi-Fi** as your computer.

Already configured for you: `backend/.env` holds `USDA_API_KEY`, `GEMINI_API_KEY`,
`LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-flash-latest`. Nothing else to set up.

## 1. Backend (one command)

```bash
cd backend && ./run.sh
```

This brings up the Postgres container, installs Python deps, **seeds sample data on
first run**, and serves the API on **http://localhost:8000** (docs at `/docs`).
Leave it running. Health check: open http://localhost:8000/health.

> First run downloads the local embedding model (~130 MB) once. If Docker isn't
> running yet, start Docker Desktop first.

## 2a. Web app

```bash
cd web && npm install && npm run dev
```

Open **http://localhost:5173**. Onboard your profile → the dashboard, capture, ask,
and insights all work immediately against the sample data.

## 2b. Mobile app

**Fast path (Expo Go):**
```bash
cd mobile && npm install && npx expo start
```
Scan the QR code with Expo Go. **On a physical phone you must point the app at your
computer's LAN IP** (not `localhost`): edit `mobile/src/config.ts` and set
`API_URL` to e.g. `http://192.168.1.42:8000` (find your IP with `ipconfig getifaddr en0`
on macOS). Rebuild/reload the app.

**Installed-app path (standalone build):** for a real installed app (and required
for the Meta-glasses native module), build a dev/standalone binary with EAS:
```bash
npm install -g eas-cli && eas login
cd mobile && eas build --profile development --platform ios   # or android
```
Install the resulting build on your phone. See `docs/META_GLASSES.md` — glasses need
this native build, not Expo Go.

## 3. Connect Meta glasses (optional)

The glasses are a second capture source feeding the *same* backend. This needs a
native dev build + Meta developer access and can't run in Expo Go. Full, honest
step-by-step: **`docs/META_GLASSES.md`**. Until then, the **phone camera capture
works today** and the app is fully usable.

## 4. Use it

1. **Profile** — enter age/height/weight/goal → get a calorie target + nutrient targets.
2. **Capture** — snap/pick a photo + note → review the auto-extracted items (edit
   quantities) → save. Real nutrition is looked up (USDA) and totals computed.
3. **Dashboard** — calorie ring vs goal, macro/micro adequacy, and **Insights**.
4. **Ask** — natural language: "how much protein this week", "what was that mushroom
   dish", "protein from chicken meals this week" — watch the route badge.

## Handy commands

```bash
# reset sample data to a fresh "today"
curl -X POST http://localhost:8000/admin/reset

# run the test suite
cd backend && source .venv/bin/activate && pytest tests/

# run the router evaluation (deterministic stub baseline)
cd backend && source .venv/bin/activate && LLM_PROVIDER=off python -m eval.run

# stop / start just the database
docker compose down      # (add -v to wipe data)
docker compose up -d
```

## Notes

- **Real AI vs stub**: with the Gemini key in `.env`, capture uses real vision
  extraction and Ask uses a real LLM router/synthesis. The free tier rate-limits
  under bursts, so some calls fall back to the deterministic stub — the app never
  breaks, it just occasionally answers with the template path.
- **Everything is local**: Postgres in Docker, embeddings in-process. Only USDA
  lookups (novel foods) and LLM calls leave your machine.
- If a screen shows "can't reach the backend", the backend isn't running on `:8000`
  (or, on a phone, `API_URL` isn't your LAN IP).
