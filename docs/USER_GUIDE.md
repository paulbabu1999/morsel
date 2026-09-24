# Welcome to Bite 🍊

**Bite is a gentle food-memory app.** Snap a photo of what you're eating, and Bite
reads it, fills in real nutrition, and keeps a calm, private record you can
actually keep up with. No calorie-shaming, no crash diets — just a clear picture
of how you eat and a soft nudge toward your goal.

This guide walks through everything you can do, in the order you'll probably use it.

**Live app:** https://morsel-7yy.pages.dev

---

## 1. Getting started (2 minutes)

1. **Create an account** — email + a password (8+ characters). That's it; no card,
   no verification hoops.
2. **Set up your profile.** The first time you sign in, Bite asks for your age,
   height, weight, activity level, and goal (lose / maintain / gain). From that it
   computes a **daily calorie target** plus personalized protein, carb, fat, fiber,
   and micronutrient goals. You can change these any time on the **Profile** page.
3. **Log your first meal** (next section). The app comes alive once it has a little
   data to show you.

> **Heads up on speed:** Bite runs on a free hosting tier, so the *very first*
> request after it's been idle can take 30–60 seconds to wake up. After that it's
> quick. If something times out, just try again in a moment.

---

## 2. Capture — logging a meal

**Capture** is the heart of the app. There are three ways to log, from fastest to
most precise:

### 📸 Snap a photo (the signature flow)
1. Tap **Take photo** (or **Choose from library**). Add the finished dish — and,
   for something cooked, a couple of ingredient photos too. Bite treats them as
   **one meal** and adds up the parts.
2. Optionally add a **note** ("grabbed a burrito and an iced coffee"), a
   **location**, and set **when** you ate it (defaults to now).
3. Tap **Analyze.** Bite reads the photo + note into an **editable draft** — a list
   of items with calories and macros, each resolved against real nutrition
   databases (USDA, Open Food Facts).

### ⌨️ Quick log (type a whole day at once)
Below the photo form, the **Quick log** box lets you type everything in plain
language — *"oatmeal and coffee for breakfast, a chicken burrito at Chipotle for
lunch, an apple."* Bite splits it into separate meals you review and save together.

### 🔁 Log again
At the top of Capture, **Log again** chips show meals you eat often, biased to the
time of day. One tap re-logs them — perfect for your usual breakfast.

### Editing the draft before you save
Nothing is saved until you confirm, so tweak freely:
- **Edit any item** — change the name, quantity, or unit. Change the quantity and
  the calories scale with it automatically.
- **Add or remove items.**
- **"Fix it" in plain English** — not quite right? Type a correction like *"the dal
  is cooked, ~200 cal"* or *"only 2 rotis"* and Bite re-estimates the whole meal.
- A **confidence chip** tells you how sure the analysis is — a cue for when to
  double-check the numbers.

Hit **Confirm & save meal** and it lands in your history with full nutrition.
Your in-progress draft is saved automatically, so you can navigate away and come
back without losing it.

---

## 3. Dashboard — your day at a glance

The **Dashboard** is your home base. A time toggle at the top switches between
**Today / Week / Month**.

- **Consistency streak** — a row of dots showing how many of the last 7 days you
  logged. This is the number that actually matters: *showing up beats being
  perfect.* Bite celebrates it and never shames a gap.
- **Calories vs goal** — a ring showing intake against your daily target. Over your
  goal? It stays a calm terracotta, never an alarming red — one day over is noise.
- **Macros** — protein, carbs, and fat vs your targets, with a friendly "on track"
  when you're in range.
- **Weight trend** — log your weight now and then; Bite shows a **smoothed** trend
  line (not the jumpy daily number), so a normal water-weight day never reads as
  "you gained."
- **Insights** — a warm, plain-English summary of what's going well plus one small,
  optional suggestion drawn from your own data.
- **Charts** — calories by day, top foods, meals by type, and nutrient adequacy
  (including limits like sodium and sugar).

---

## 4. History — everything you've logged

**History** is your full meal log. Search by keyword, filter by meal type, and tap
any meal to see the full breakdown: photos, every item, macros, micronutrients,
tags, and how each food's nutrition was resolved.

---

## 5. Ask — question your food memory

**Ask** lets you query your history in plain English. Try:
- *"How much protein did I eat this week?"*
- *"What was that mushroom dish?"*
- *"How often did I eat out this week?"*
- *"Am I getting enough fiber?"*

Behind the scenes a small router reads your question and picks how to answer —
crunching the numbers (**Aggregate**), searching by meaning (**Semantic**), or both
(**Hybrid**) — and shows you which path it took, plus the meals it used as evidence.

---

## 6. Weight tracking

Log a weigh-in from the **Weight trend** card on the Dashboard. Because Bite smooths
the trend, you see the real direction you're heading — not the daily noise that
makes people give up. Losing shows a gentle green; a bump up stays neutral.

---

## 7. Reminders

On the **Reminders** page, set gentle nudges to log your meals (e.g., a lunchtime
and an evening reminder). *Note:* on the web app these fire while Bite is open or
running in the background in your browser — for always-on reminders, add Bite to
your home screen (below).

---

## 8. Community — Feed, Friends & Groups (optional)

Bite has a light social layer for **gentle accountability — support, not a
scoreboard.** It's entirely optional.
- **Friends** — set a display name, search for people, and follow them. See your
  followers and who you follow under "Your circle."
- **Groups** — create a private, invite-only group (a family, a few friends, a
  challenge) and share it with a code, or join one.
- **Sharing** — when you save a meal, you can share it to your followers or a group
  with an optional note.
- **Feed** — shows meals shared by people you follow and your groups.

**Important:** the feed deliberately **never shows calories or macros** — just the
photo, a description, and a note. It's meant to feel supportive, not competitive.
If you'd rather keep things private, simply don't share — nothing is shared unless
you choose to.

---

## 9. Profile & goals

The **Profile** page holds your details and goals. Update your weight, activity, or
goal and Bite recomputes your calorie and nutrient targets — and the Dashboard
updates to match. It also explains *why* your targets are what they are.

---

## 10. Install it like an app

Bite is a Progressive Web App. On your phone's browser, use **"Add to Home
Screen"** — you'll get an app icon, a full-screen experience, and it launches like
a native app. On desktop, look for the install icon in your browser's address bar.

---

## The Bite philosophy

Most tracking apps quit on you because they make you feel bad. Bite is built on the
opposite idea, drawn from behavior-change research:

- **Consistency over perfection.** Logging most days is what changes outcomes — so
  that's what Bite celebrates.
- **No shame.** No alarm-red numbers, no "you failed today." Being over your goal for
  a day is normal and treated as noise.
- **Smoothed signals.** Weight and trends are smoothed so a single bad reading never
  derails you.
- **Your data is yours.** Everything is private by default and isolated to your
  account; nothing is social unless you deliberately share it.

---

## Quick troubleshooting

| Problem | What to do |
|---|---|
| First action is slow / "backend waking up" | The free server idles after ~15 min. Wait ~30–60s and retry; it's fast once awake. |
| A food's calories look off | Open the meal and use **"Fix it"** with a plain-language correction, or edit the item directly. |
| Dashboard shows 0 for "Today" | You haven't logged today yet — check **Week** or **Month**, or log a meal. |
| Reminder didn't fire | Web reminders only fire while the app is open/backgrounded. Add Bite to your home screen for the best experience. |
| Want to start fresh | Update anything on **Profile**; your targets recompute instantly. |

---

*Bite — eat well, gently.*
