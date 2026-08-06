# Morsel — Food Memory (web)

A polished React web client for the agentic **food-memory** API. Capture meals,
browse your eating history, see a stats dashboard, and — the centerpiece — **ask
questions in plain English** and watch the router pick its retrieval path
(`aggregate` / `semantic` / `hybrid`).

Built with **Vite + React 18 + TypeScript**, **react-router-dom v6**, **recharts**,
and plain CSS (a single hand-rolled dark design system — no UI framework).

## Screens

| Route         | What it does                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| `/`           | **Dashboard** — KPI cards, calories-by-day chart, meal-type & top-food breakdowns, today's meals. Period toggle (day/week/month) hits `GET /stats`. |
| `/capture`    | **Capture** — log a meal (photo + note + source/meal-type/location) via `POST /capture`; renders the structured record returned by the (stubbed) extractor. |
| `/history`    | **History** — meal cards with search (`q`), meal-type and date-range filters over `GET /meals`. |
| `/meals/:id`  | **Meal detail** — full photo, per-item macro table, totals, tags, confidence, source. |
| `/ask`        | **Ask** — natural-language questions via `POST /query`, with a prominent color-coded **route badge**, the router's rationale, backing numbers, and cited meals. |

## Prerequisites

- **Node 18+** and npm.
- The **backend running on `http://localhost:8000`** (see `../backend`). From the
  project root:

  ```bash
  cd backend && ./run.sh      # serves the sample-data API on :8000
  ```

If the backend is down, every screen shows a friendly "start the backend on :8000"
message instead of erroring out.

## Getting started

```bash
npm install       # install dependencies
npm run dev       # start the Vite dev server (http://localhost:5173)
```

Then open the dev-server URL it prints.

## Configuration

The API base URL comes from the `VITE_API_URL` environment variable and falls
back to `http://localhost:8000`. Copy the example and edit if your backend runs
elsewhere:

```bash
cp .env.example .env
# .env
VITE_API_URL=http://localhost:8000
```

## Scripts

| Command             | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Start the dev server with HMR.                          |
| `npm run build`     | Type-check (`tsc -b`) and build a production bundle.    |
| `npm run preview`   | Serve the production build locally.                     |
| `npm run typecheck` | Type-check only.                                        |

## Project structure

```
src/
  api.ts              typed fetch client + all contract interfaces
  App.tsx             router + app shell
  main.tsx            entry point
  styles.css          the whole design system (tokens + components)
  lib/
    format.ts         date/number/label helpers (naive-local ISO aware)
    useAsync.ts       loading/error/data hook used by every screen
  components/
    Sidebar.tsx       nav + live backend-health pill
    MealCard.tsx      full + compact meal cards
    badges.tsx        RouteBadge + SourceBadge
    states.tsx        Loading / Error / Empty / skeletons
    ui.tsx            PageHead + KPI
    icons.tsx         inline SVG icon set
  pages/
    Dashboard.tsx  Capture.tsx  History.tsx  MealDetail.tsx  Ask.tsx
```

> **Note:** the backend serves deterministic **sample data** and stubs the LLM
> router, text-to-SQL, and vector retrieval. The API shape is production-stable, so
> the real engine can drop in behind it without touching this frontend.
