# API Contract v2 — Morsel backend

Base URL (local dev): `http://localhost:8000` · Interactive docs: `/docs`

Iteration 2 is the **real engine**: Postgres + pgvector storage, a LangGraph
dual-query router (aggregate text-to-SQL / semantic pgvector+FTS / hybrid),
Claude vision extraction + USDA nutrition — with automatic keyword/formula
**stub fallback** when `ANTHROPIC_API_KEY` is unset (so the app always runs).
CORS is open. **Multi-user: email/password → JWT.** Every endpoint except
`/health`, `/auth/*`, and `/query/examples` requires `Authorization: Bearer <token>`;
data is isolated per user via Row-Level Security.

## Auth
- `POST /auth/signup` `{email, password}` → `{token, user_id, email}` (password ≥ 8 chars; 409 if email taken). New accounts are seeded with sample meals in the background.
- `POST /auth/login` `{email, password}` → `{token, user_id, email}` (401 on mismatch).
- `GET /auth/me` (Bearer) → `{user_id, email}`.
- Send `Authorization: Bearer <token>` on all other calls. Missing/invalid → 401/403.

## Nutrient set
Every item/meal carries: `calories` (int, kcal) + `protein_g`, `carbs_g`,
`fat_g`, `fiber_g`, `sugar_g`, `sodium_mg`, `satfat_g`, `iron_mg`, `calcium_mg`,
`potassium_mg`. On `meals` these are prefixed `total_` (e.g. `total_protein_g`).

## Types

### Meal
```jsonc
{
  "id": "meal-ab12", "user_id": "user-1",
  "eaten_at": "2026-07-22T19:59:00", "meal_type": "breakfast|lunch|dinner|snack",
  "location_text": "Bangkok Corner" | "Home" | null,
  "photo_uri": "https://…" | null, "note_text": "…" | null,
  "description": "Dinner at Bangkok Corner: Pad Thai.",
  "tags": ["thai","noodles","eating-out"],
  "source": "glasses|phone|manual", "confidence": 0.9,
  "total_calories": 720, "total_protein_g": 28.0, /* …all total_* nutrients… */
  "created_at": "2026-07-22T19:59:00",
  "items": [ MealItem, … ]   // present on GET /meals/{id} and POST /meals
}
```

### MealItem
```jsonc
{
  "id": "item-9c", "food_entity_id": 7, "raw_name": "chicken burrito",
  "canonical_name": "Chicken Burrito", "quantity": 1, "unit": "burrito", "grams": 330,
  "calories": 644, "protein_g": 37.9, /* …all nutrients… */
  "confidence": 0.9, "resolution_method": "alias|similar|usda|fallback"
}
```

### Profile
```jsonc
{
  "user_id":"user-1","age":29,"sex":"male","height_cm":178,"weight_kg":75,
  "activity_level":"sedentary|light|moderate|active|very_active",
  "goal_type":"lose|maintain|gain","goal_rate":"0.5kg/week",
  "daily_calorie_target":2170,"tdee_estimate":2670,
  "protein_target_g":135,"carb_target_g":...,"fat_target_g":...,
  "fiber_target_g":30.4,"sugar_limit_g":...,"sodium_limit_mg":2300,"satfat_limit_g":...,
  "iron_target_mg":8,"calcium_target_mg":1000,"potassium_target_mg":3400,
  "target_source":"llm|formula","rationale":"…","onboarded":true,"updated_at":"…"
}
```

## Endpoints

### `GET /health`
`{ status, db:{connected,meals,food_entities}, llm:"claude"|"stub…", embeddings, time }`

### `GET /profile` → `Profile | null`
Null until onboarding is done.

### `POST /profile` → `Profile`
Body = `ProfileInput` (`age, sex, height_cm, weight_kg, activity_level, goal_type, goal_rate`).
A **single backend Claude call** (or formula fallback) derives the calorie goal +
personalized nutrient targets, persists, and returns the full `Profile`.

### `POST /capture/analyze` (multipart) → `CaptureDraft` **(no DB write)**
Fields: `photo` (file, optional), `note`, `meal_type?`, `location?`, `source`.
Returns an editable draft:
```jsonc
{
  "items": [ MealItem, … ],   // resolved nutrition, editable client-side
  "meal_type":"lunch","location":"Chipotle (Downtown)","note":"…","source":"glasses",
  "photo_uri":null,"description":"…","tags":[…],"confidence":0.86,
  "total_calories":1297, /* …all total_* … */
  "extractor":"claude-vision | stub (…)",
  "extraction_note":"3 item(s) identified; nutrition resolved via alias, usda."
}
```

### `POST /meals` (JSON) → `Meal`  **(persist a confirmed/edited draft)**
```jsonc
{ "meal_type":"lunch", "items":[{"name":"chicken burrito","quantity":1,"unit":null,"grams":null}, …],
  "eaten_at":null, "location":"…", "note":null, "source":"phone", "photo_uri":null, "description":null, "tags":[] }
```
Items are **re-resolved server-side**, so edits to name/quantity yield correct
nutrition. Returns the saved `Meal` (with `items`).

### `GET /meals` → `Meal[]`
Query: `start`, `end` (ISO), `meal_type`, `q` (free text), `limit` (≤1000). Newest first.

### `GET /meals/{id}` → `Meal` (with `items`) or 404.

### `POST /query` (JSON `{question}`) → `QueryResponse`
```jsonc
{ "question":"…", "answer":"…",
  "route":"aggregate|semantic|hybrid", "router_note":"how it was routed + real-system detail",
  "meals":[ Meal, … ],           // cited/supporting
  "data":{ … }, "sql":"SELECT … LIMIT 1000" }  // sql present on aggregate
```
Surface the `route` badge — it's the whole story. `sql` shows the (guarded) query.

### `GET /query/examples` → `string[]`

### `GET /stats?period=day|week|month` → `StatsResponse`
Adds targets + adequacy vs. the profile:
```jsonc
{
  "period":"week","start":"…","end":"…","total_meals":21,"total_calories":13026,
  "avg_calories_per_day":1860.9,"avg_protein_per_day":110.5,
  "eat_out_meals":3,"eat_out_rate":0.14,
  "targets": Profile | null,
  "adequacy":[ {"nutrient":"protein_g","label":"Protein","unit":"g","amount":110.5,
                "target":135,"pct":82,"status":"low|ok|high|over|unknown",
                "kind":"target|limit"}, … ],   // amount = per-day average
  "by_day":[ {date,calories,protein_g,carbs_g,fat_g,meals}, … ],
  "top_foods":[ {name,count}, … ], "by_meal_type":{ "lunch":6, … }
}
```
`kind:"target"` = hit it (status `low` if under); `kind:"limit"` = stay under
(status `over` if exceeded). Use for the calorie ring (intake vs
`targets.daily_calorie_target`) and micro adequacy bars.

### `GET /insights?period=day|week|month` → `InsightsResponse`
Actionable, neutral advice derived from history + targets (rule-based, with an
optional LLM-written headline):
```jsonc
{
  "period":"week",
  "headline":"…one friendly sentence…",
  "insights":[
    { "kind":"calorie|nutrient_low|nutrient_high|swap|pattern",
      "severity":"info|suggest|watch",
      "title":"Low on calcium",
      "detail":"About 64% of your calcium target this week … Foods high in it: …" },
    …
  ]
}
```
Color `severity` (info=gray, suggest=blue, watch=amber). Never judgmental.

### `POST /admin/reset` → reseed sample data. `{ food_entities_added, meals_added }`

## Frontend notes
- Timestamps are naive local ISO (no `Z`) — parse as local.
- `photo_uri` are `picsum.photos` placeholders — safe to `<img>`.
- Dashboard ring: `stats.total_calories / period` or today's intake vs
  `targets.daily_calorie_target`. Adequacy bars: `adequacy[].status` → color.
- Capture is **two-step**: `POST /capture/analyze` → let the user edit items →
  `POST /meals`.
- If `/profile` is null, route the user through onboarding first.
