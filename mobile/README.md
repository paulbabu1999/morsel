# Morsel — mobile app

The mobile client for the agentic **food memory** app. Snap or describe a meal,
browse your food feed, see nutrition stats, and **ask questions in plain English**
— with a visible badge showing which retrieval route the (stubbed) AI router chose.

Built with **Expo (managed workflow) + React Native + TypeScript**.

## What it does

Four tabs:

1. **Capture** (primary) — a capture-source segmented control: **Phone camera** (real,
   via `expo-image-picker`) and **Glasses** (Ray-Ban Meta, shown as a labeled
   *prototype / coming soon* option to prove the source abstraction; no Meta SDK).
   Take a photo or pick from the library, add a note ("grabbed a burrito and an
   iced coffee") and an optional meal type, then log it. The structured meal
   (items, macros, calories, tags) comes back with a note explaining that
   extraction is stubbed on the backend.
2. **Feed** — meals newest-first as cards (photo, description, time, location,
   calories/protein, source badge). Tap a card for the full detail view.
3. **Stats** — KPI tiles, a lightweight calories-by-day bar chart (plain `View`s,
   no native chart lib), top foods, and a meal-type breakdown. Switch day/week/month.
4. **Ask** — the flagship. Type a question or tap a suggested chip, and get an
   answer with a prominent, color-coded **route badge** (aggregate / semantic /
   hybrid), the router note, backing data, and cited supporting meals.

## Prerequisites

- Node.js 18+ and npm
- The **backend** running (see `../backend`). It must be reachable from the device
  running the app. Start it from the repo root:
  ```bash
  cd ../backend && ./run.sh      # serves http://localhost:8000 on 0.0.0.0
  ```
- The Expo Go app on your phone (iOS/Android), or an iOS Simulator / Android
  Emulator.

## Run

```bash
npm install
npx expo start
```

Then:

- **Physical phone**: scan the QR code with Expo Go (Android) or the Camera app (iOS).
- **iOS Simulator**: press `i` in the Expo CLI. **Android Emulator**: press `a`.
- **Web preview**: press `w` (handy, but camera capture is limited in the browser).

## ⚠️ IMPORTANT — set `API_URL` for real devices

The API base URL lives in **`src/config.ts`**:

```ts
export const API_URL = 'http://localhost:8000';
```

`localhost` only reaches the backend when the app runs in a **web browser** or an
**iOS Simulator on the same machine**. On a **physical phone** (or an Android
emulator), `localhost` points at the device itself, so the app can't reach your
computer and you'll see a "Can't reach the backend" screen.

To run on a real phone:

1. Find your computer's LAN IP:
   ```bash
   ipconfig getifaddr en0      # macOS Wi-Fi
   ```
2. Edit `src/config.ts` and set, e.g.:
   ```ts
   export const API_URL = 'http://192.168.1.42:8000';
   ```
3. Make sure the phone and computer are on the **same Wi-Fi network**, and the
   backend is started with host `0.0.0.0` (the provided `run.sh` already does this).

Save the file — Fast Refresh picks it up. If a screen still can't connect, its
error state repeats these steps.

## Type checking

```bash
npx tsc --noEmit      # must exit 0
```

## Notes / caveats

- **Expo Go**: everything runs in Expo Go — no custom native modules are used.
  Camera and photo-library permissions are requested at runtime.
- **Photo bytes aren't analyzed.** The backend accepts the uploaded image but
  extraction is stubbed; it builds the structured meal by keyword-matching your
  note against a food catalog. Capture works with a photo, a note, or both.
- **Multipart vs JSON capture**: when a photo is attached the app uses
  `POST /capture` (multipart/form-data with a React Native `{ uri, name, type }`
  file); with no photo it falls back to `POST /capture/json`.
- The backend regenerates sample data relative to *today* on each start, so the
  feed and "this week" stats always have data.

## Project layout

```
mobile/
├── App.tsx                     # navigation root (tabs + shared MealDetail stack)
├── app.json                    # Expo config (name "Morsel", image-picker plugin)
├── src/
│   ├── api.ts                  # typed API client + contract interfaces
│   ├── config.ts               # API_URL (edit this for LAN / devices)
│   ├── theme.ts                # colors, spacing, typography tokens
│   ├── components/             # Card, badges, MealCard, Macros, state views, header
│   ├── hooks/useAsync.ts       # fetch + loading/error/refresh helper
│   ├── navigation/types.ts     # navigation param lists
│   ├── screens/                # Capture, Feed, MealDetail, Stats, Ask
│   └── utils/format.ts         # date/number formatting
```
