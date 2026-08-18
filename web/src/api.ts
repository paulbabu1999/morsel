/**
 * Typed API client for the Bite backend (contract v2).
 *
 * All shapes mirror API_CONTRACT.md exactly. The base URL comes from
 * `VITE_API_URL` and falls back to http://localhost:8000 for local dev.
 */

export const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

/* ------------------------------------------------------------------ *
 * Types (mirror the backend contract)
 * ------------------------------------------------------------------ */

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type CaptureSource = "glasses" | "phone" | "manual";
export type QueryRoute = "aggregate" | "semantic" | "hybrid";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type GoalType = "lose" | "maintain" | "gain";
export type Sex = "male" | "female";

export type ResolutionMethod = "alias" | "similar" | "usda" | "fallback";
export type AdequacyStatus = "low" | "ok" | "high" | "over" | "unknown";
export type AdequacyKind = "target" | "limit";

/** Full per-item nutrition. Every item carries the complete nutrient set. */
export interface MealItem {
  id: string;
  food_entity_id: number | null;
  raw_name: string;
  canonical_name: string;
  quantity: number;
  unit: string | null;
  grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  satfat_g: number;
  iron_mg: number;
  calcium_mg: number;
  potassium_mg: number;
  confidence: number;
  // e.g. "alias", "usda", "off", "fallback", or a "…+anchored" variant
  resolution_method: string | null;
}

export interface Meal {
  id: string;
  user_id: string;
  eaten_at: string; // naive local ISO
  meal_type: MealType;
  location_text: string | null;
  photo_uri: string | null;
  photo_uris: string[];
  note_text: string | null;
  description: string;
  tags: string[];
  source: CaptureSource;
  confidence: number;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fiber_g: number;
  total_sugar_g: number;
  total_sodium_mg: number;
  total_satfat_g: number;
  total_iron_mg: number;
  total_calcium_mg: number;
  total_potassium_mg: number;
  created_at: string;
  items: MealItem[];
}

/** The user's onboarding + personalized nutrient targets. */
export interface Profile {
  user_id: string;
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate: string;
  daily_calorie_target: number;
  tdee_estimate: number;
  protein_target_g: number;
  carb_target_g: number;
  fat_target_g: number;
  fiber_target_g: number;
  sugar_limit_g: number;
  sodium_limit_mg: number;
  satfat_limit_g: number;
  iron_target_mg: number;
  calcium_target_mg: number;
  potassium_target_mg: number;
  target_source: "llm" | "formula";
  rationale: string;
  onboarded: boolean;
  updated_at: string;
}

/** Body for POST /profile. */
export interface ProfileInput {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate: string;
}

/** Unsaved, editable draft returned by POST /capture/analyze. */
export interface CaptureDraft {
  items: MealItem[];
  meal_type: MealType;
  location: string | null;
  note: string | null;
  source: CaptureSource;
  photo_uri: string | null;
  photo_uris: string[];
  photo_count: number;
  description: string;
  tags: string[];
  confidence: number;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fiber_g: number;
  total_sugar_g: number;
  total_sodium_mg: number;
  total_satfat_g: number;
  total_iron_mg: number;
  total_calcium_mg: number;
  total_potassium_mg: number;
  extractor: string;
  extraction_note: string;
}

/** One edited item to persist via POST /meals. */
export interface MealItemInput {
  name: string;
  quantity: number;
  unit?: string | null;
  grams?: number | null;
  /**
   * Calorie anchor for the item. The backend uses it to sanity-check the
   * resolved density (e.g. raw-vs-cooked), so the editor forwards it when known.
   */
  calories?: number | null;
}

/** Body for POST /meals. */
export interface MealCreate {
  meal_type: MealType;
  items: MealItemInput[];
  eaten_at?: string | null;
  location?: string | null;
  note?: string | null;
  source: CaptureSource;
  photo_uri?: string | null;
  photo_uris?: string[] | null;
  description?: string | null;
  tags?: string[];
}

export interface QueryResponse {
  question: string;
  answer: string;
  route: QueryRoute;
  router_note: string;
  meals: Meal[];
  data: Record<string, unknown>;
  sql?: string | null;
}

export interface DayNutrition {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: number;
}

export interface TopFood {
  name: string;
  count: number;
}

export interface Adequacy {
  nutrient: string;
  label: string;
  unit: string;
  amount: number; // per-day average
  target: number;
  pct: number;
  status: AdequacyStatus;
  kind: AdequacyKind;
}

export interface StatsResponse {
  period: string;
  start: string;
  end: string;
  total_meals: number;
  total_calories: number;
  days_tracked: number;
  logged_days_7d: number;
  avg_calories_per_day: number;
  avg_protein_per_day: number;
  eat_out_meals: number;
  eat_out_rate: number;
  targets: Profile | null;
  adequacy: Adequacy[];
  by_day: DayNutrition[];
  top_foods: TopFood[];
  by_meal_type: Record<string, number>;
}

export type InsightKind =
  | "calorie"
  | "nutrient_low"
  | "nutrient_high"
  | "swap"
  | "pattern";
export type InsightSeverity = "info" | "suggest" | "watch";

export interface Insight {
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
}

export interface InsightsResponse {
  period: string;
  headline: string;
  insights: Insight[];
}

export interface HealthResponse {
  status: string;
  db: { connected: boolean; meals: number; food_entities: number };
  llm: string;
  embeddings: string;
  time: string;
}

/** Returned by POST /auth/signup and POST /auth/login. */
export interface AuthResult {
  token: string;
  user_id: string;
  email: string;
}

/** Returned by GET /auth/me. */
export interface AuthUser {
  user_id: string;
  email: string;
}

/* ------------------------------------------------------------------ *
 * Error type + low-level request helper
 * ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ *
 * Auth token storage
 *
 * The JWT lives in localStorage so a reload keeps the user signed in.
 * Every request automatically attaches it as a Bearer header, and any
 * 401 (expired / invalidated token) clears it and bounces to /login so
 * a stale token can never wedge the app.
 * ------------------------------------------------------------------ */

const TOKEN_KEY = "morsel_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage disabled — token stays in-memory for this tab only */
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

interface RequestOptions {
  /**
   * When true (the default), a 401 clears the token and hard-redirects to
   * /login. Auth calls (login/signup/me) opt out so wrong credentials or a
   * boot-time token check surface as normal errors instead.
   */
  redirectOn401?: boolean;
}

/* ------------------------------------------------------------------ *
 * Transient-failure retry policy
 *
 * The backend runs on a Render free-tier box that cold-starts (~30s) after
 * idling, so a first request can time out or bounce off Render's proxy with a
 * 502/503/504 while the container spins up. We retry those transient failures
 * with exponential backoff and give each attempt a long (45s) timeout so a
 * single cold start can ride through. 4xx (auth/validation) and normal 2xx
 * responses are never retried.
 * ------------------------------------------------------------------ */

// Backoff before each retry. Three delays => up to 3 retries (4 attempts total).
const RETRY_DELAYS_MS = [800, 1600, 3200];
const REQUEST_TIMEOUT_MS = 45_000; // headroom over a ~30s Render cold start
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: RequestOptions = {},
): Promise<T> {
  const { redirectOn401 = true } = opts;

  // Attach the bearer token (without clobbering an explicit override or the
  // multipart boundary Content-Type the browser sets for FormData bodies).
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const unreachable = () =>
    new ApiError(
      `Can't reach the backend at ${API_URL}. Start it on :8000 and try again.`,
    );

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const canRetry = attempt < RETRY_DELAYS_MS.length;

    // Per-attempt timeout: lets a cold start complete, but still aborts a truly
    // hung socket so it surfaces as a retryable "network/timeout" error.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      // Network-level failure or timeout abort — transient. Back off and retry
      // while attempts remain; otherwise surface the standard unreachable error.
      clearTimeout(timer);
      if (canRetry) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw unreachable();
    }
    clearTimeout(timer);

    // Render cold-start / transient gateway error: back off and retry.
    if (RETRYABLE_STATUS.has(res.status) && canRetry) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (res.status === 401 && redirectOn401) {
      // Expired / invalidated token: drop it and send the user back to login.
      clearToken();
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.assign("/login");
      }
      throw new ApiError("Your session has expired. Please log in again.", 401);
    }

    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        /* non-JSON error body — keep the status text */
      }
      throw new ApiError(detail, res.status);
    }

    // 204 / empty bodies
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // The loop always returns or throws above; this satisfies the type checker.
  throw unreachable();
}

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export interface MealFilters {
  start?: string;
  end?: string;
  meal_type?: MealType | "";
  q?: string;
  limit?: number;
}

export interface CaptureInput {
  photos?: File[]; // final dish + optional ingredient photos, one meal
  note?: string;
  meal_type?: MealType | "";
  location?: string;
  source?: CaptureSource;
}

/**
 * Fire-and-forget ping to wake the (Render free-tier) backend before the user
 * reaches a real request. Cheap, unauthenticated, and never throws.
 */
export function warmup(): void {
  fetch(`${API_URL}/health`).catch(() => {});
}

export const api = {
  health: () => request<HealthResponse>("/health"),

  /* ---- Auth ---- */

  /** Create an account. Stores the returned JWT on success. */
  signup: async (email: string, password: string): Promise<AuthResult> => {
    const result = await request<AuthResult>(
      "/auth/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      { redirectOn401: false },
    );
    setToken(result.token);
    return result;
  },

  /** Log in. Stores the returned JWT on success. */
  login: async (email: string, password: string): Promise<AuthResult> => {
    const result = await request<AuthResult>(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      { redirectOn401: false },
    );
    setToken(result.token);
    return result;
  },

  /** Resolve the current token to its user (used to validate on boot). */
  me: () => request<AuthUser>("/auth/me", {}, { redirectOn401: false }),

  /** Clear the stored token (client-side sign-out). */
  logout: () => clearToken(),

  getProfile: () => request<Profile | null>("/profile"),

  saveProfile: (input: ProfileInput) =>
    request<Profile>("/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  getStats: (period: "day" | "week" | "month" = "week") =>
    request<StatsResponse>(
      `/stats${toQuery({ period, tz_offset: new Date().getTimezoneOffset() })}`,
    ),

  getInsights: (period: "day" | "week" | "month" = "week") =>
    request<InsightsResponse>(
      `/insights${toQuery({ period, tz_offset: new Date().getTimezoneOffset() })}`,
    ),

  listMeals: (filters: MealFilters = {}) =>
    request<Meal[]>(`/meals${toQuery({ ...filters })}`),

  getMeal: (id: string) => request<Meal>(`/meals/${encodeURIComponent(id)}`),

  /** Step 1 of capture: analyze a photo/note into an editable draft (no DB write). */
  analyzeCapture: (input: CaptureInput) => {
    const fd = new FormData();
    (input.photos ?? []).forEach((p) => fd.append("photos", p));
    if (input.note) fd.append("note", input.note);
    if (input.meal_type) fd.append("meal_type", input.meal_type);
    if (input.location) fd.append("location", input.location);
    fd.append("source", input.source ?? "phone");
    return request<CaptureDraft>("/capture/analyze", { method: "POST", body: fd });
  },

  /** Step 2 of capture: persist a confirmed/edited draft. */
  createMeal: (body: MealCreate) =>
    request<Meal>("/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  /**
   * Re-estimate the current (edited) draft from a plain-language correction —
   * e.g. "the dal is cooked, ~200 cal" or "only 2 rotis". Returns a fresh
   * CaptureDraft (same shape as analyze); no DB write.
   */
  refineCapture: (input: {
    items: {
      name: string;
      quantity: number;
      unit?: string | null;
      grams?: number | null;
      calories?: number | null;
    }[];
    correction: string;
    meal_type?: MealType;
    location?: string | null;
    note?: string | null;
    source: CaptureSource;
    photo_uris?: string[] | null;
  }) =>
    request<CaptureDraft>("/capture/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  query: (question: string) =>
    request<QueryResponse>("/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),

  queryExamples: () => request<string[]>("/query/examples"),
};
