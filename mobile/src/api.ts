/**
 * Typed API client for the Bite backend (contract v2).
 * Mirrors /Users/paulbabu/Documents/Project-diet/API_CONTRACT.md exactly.
 *
 * All network calls go through `request()`, which adds a timeout and converts
 * low-level fetch failures into a friendly, actionable ApiError.
 */
import * as SecureStore from 'expo-secure-store';
import { API_URL, AUTH_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from './config';

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type CaptureSource = 'glasses' | 'phone' | 'manual';
export type QueryRoute = 'aggregate' | 'semantic' | 'hybrid';
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type ResolutionMethod = 'alias' | 'similar' | 'usda' | 'fallback';

/** The full nutrient set every item/meal carries (meal totals are `total_`-prefixed). */
export interface Nutrients {
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
}

export interface MealItem extends Nutrients {
  id: string;
  food_entity_id: number | null;
  raw_name: string;
  canonical_name: string;
  quantity: number;
  unit: string | null;
  grams: number | null;
  confidence: number;
  resolution_method: ResolutionMethod | null;
}

export interface Meal {
  id: string;
  user_id: string;
  eaten_at: string; // naive local ISO (no Z)
  meal_type: MealType;
  location_text: string | null;
  photo_uri: string | null;
  note_text: string | null;
  description: string;
  tags: string[];
  items: MealItem[];
  source: CaptureSource;
  confidence: number;
  created_at: string;
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
}

/** Personalized targets + rationale returned by the backend after onboarding. */
export interface Profile {
  user_id: string;
  age: number;
  sex: Sex | string;
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
  target_source: 'llm' | 'formula' | string;
  rationale: string;
  onboarded: boolean;
  updated_at: string;
}

/** Body for POST /profile — the backend derives all targets from this. */
export interface ProfileInput {
  age: number;
  sex: Sex | string;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate: string;
}

/** Unsaved, editable draft returned by POST /capture/analyze (no DB write). */
export interface CaptureDraft {
  items: MealItem[];
  meal_type: MealType;
  location: string | null;
  note: string | null;
  source: CaptureSource;
  photo_uri: string | null;
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

/** A single item in a POST /meals body — re-resolved server-side. */
export interface MealItemInput {
  name: string;
  quantity: number;
  unit?: string | null;
  grams?: number | null;
}

/** Body for POST /meals — persists a confirmed/edited draft. */
export interface MealCreate {
  meal_type: MealType;
  items: MealItemInput[];
  eaten_at?: string | null;
  location?: string | null;
  note?: string | null;
  source: CaptureSource;
  photo_uri?: string | null;
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

export type AdequacyStatus = 'low' | 'ok' | 'high' | 'over' | 'unknown';
export type AdequacyKind = 'target' | 'limit';

/** One micronutrient adequacy row (amount = per-day average over the period). */
export interface AdequacyItem {
  nutrient: string;
  label: string;
  unit: string;
  amount: number;
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
  avg_calories_per_day: number;
  avg_protein_per_day: number;
  eat_out_meals: number;
  eat_out_rate: number;
  targets: Profile | null;
  adequacy: AdequacyItem[];
  by_day: DayNutrition[];
  top_foods: TopFood[];
  by_meal_type: Record<string, number>;
}

export type InsightKind = 'calorie' | 'nutrient_low' | 'nutrient_high' | 'swap' | 'pattern';
export type InsightSeverity = 'info' | 'suggest' | 'watch';

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

export type StatsPeriod = 'day' | 'week' | 'month';

/** Returned by POST /auth/signup and POST /auth/login. */
export interface AuthResult {
  token: string;
  user_id: string;
  email: string;
}

/** Returned by GET /auth/me — the identity behind the current token. */
export interface AuthUser {
  user_id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** True when we never got a response (backend down / wrong API_URL / no LAN). */
  readonly isNetwork: boolean;
  readonly status?: number;

  constructor(message: string, opts: { isNetwork?: boolean; status?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.isNetwork = opts.isNetwork ?? false;
    this.status = opts.status;
  }
}

const NETWORK_HINT =
  `Could not reach the backend at ${API_URL}.\n\n` +
  '• Start it: cd backend && ./run.sh (serves http://localhost:8000)\n' +
  "• On a physical phone, edit src/config.ts and set API_URL to your computer's " +
  'LAN IP (e.g. http://192.168.1.42:8000), on the same Wi-Fi.';

// ---------------------------------------------------------------------------
// Auth token storage
//
// The JWT is persisted with expo-secure-store (Keychain / Keystore) so a
// relaunch keeps the user signed in, and mirrored in memory so `request()` can
// attach it synchronously without awaiting the secure store on every call.
// Call `loadToken()` once on boot to hydrate the in-memory copy.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'morsel_token';

/** In-memory mirror of the persisted token (null when logged out). */
let authToken: string | null = null;

/**
 * Hydrate the in-memory token from secure storage. Call once on app boot,
 * before deciding whether to show the login screen. Returns the token (or null).
 */
export async function loadToken(): Promise<string | null> {
  try {
    authToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // Secure store unavailable (e.g. web) — treat as logged out.
    authToken = null;
  }
  return authToken;
}

/** The current bearer token, or null when logged out. Synchronous. */
export function getToken(): string | null {
  return authToken;
}

async function setToken(token: string): Promise<void> {
  authToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Persist failed — the token still lives in memory for this session.
  }
}

async function clearToken(): Promise<void> {
  authToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Forced-logout subscription. When a protected call comes back 401/403 with a
 * token attached, the token is stale: we clear it and notify listeners so the
 * AuthProvider can drop back to the login screen (the RN analogue of the web
 * client's hard redirect to /login).
 */
type AuthExpiredHandler = () => void;
const authExpiredHandlers = new Set<AuthExpiredHandler>();

/** Subscribe to forced logout. Returns an unsubscribe function. */
export function onAuthExpired(handler: AuthExpiredHandler): () => void {
  authExpiredHandlers.add(handler);
  return () => {
    authExpiredHandlers.delete(handler);
  };
}

function notifyAuthExpired(): void {
  authExpiredHandlers.forEach((h) => {
    try {
      h();
    } catch {
      // a broken listener must not wedge the others
    }
  });
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: BodyInit;
  headers?: Record<string, string>;
  /**
   * When true (the default), a 401/403 on a request that carried a token clears
   * that token and fires the auth-expired handler, bouncing the app to login.
   * Auth calls (login / signup / me) opt out so wrong credentials or a boot-time
   * token check surface as ordinary errors instead of a forced logout.
   */
  bounceOnAuthError?: boolean;
  /** Override the request timeout (auth calls use a longer one for cold starts). */
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { bounceOnAuthError = true, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Attach the bearer token. We build a fresh headers object so we never mutate
  // the caller's; for a FormData body we deliberately leave Content-Type unset
  // so fetch adds the multipart boundary itself.
  const headers: Record<string, string> = { ...options.headers };
  if (authToken && !('Authorization' in headers) && !('authorization' in headers)) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`Request timed out.\n\n${NETWORK_HINT}`, { isNetwork: true });
    }
    throw new ApiError(NETWORK_HINT, { isNetwork: true });
  }
  clearTimeout(timer);

  // Stale/invalid token on a protected call → drop it and return to login.
  if ((res.status === 401 || res.status === 403) && bounceOnAuthError && authToken) {
    await clearToken();
    notifyAuthExpired();
    throw new ApiError('Your session has expired. Please log in again.', { status: res.status });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data?.detail === 'string') detail = data.detail;
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(
      detail || `Request failed (${res.status} ${res.statusText}).`,
      { status: res.status },
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface ListMealsParams {
  start?: string;
  end?: string;
  meal_type?: MealType;
  q?: string;
  limit?: number;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Create an account. Persists the returned JWT on success. 409 if email taken. */
export async function signup(email: string, password: string): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    bounceOnAuthError: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
  await setToken(result.token);
  return result;
}

/** Log in. Persists the returned JWT on success. 401 on wrong credentials. */
export async function login(email: string, password: string): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    bounceOnAuthError: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
  await setToken(result.token);
  return result;
}

/** Resolve the current token to its user — used to validate the token on boot. */
export function me(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me', {
    bounceOnAuthError: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

/** Client-side sign-out: clear the stored + in-memory token. */
export function logout(): Promise<void> {
  return clearToken();
}

/** Current user's profile, or null until onboarding is complete. */
export function getProfile(): Promise<Profile | null> {
  return request<Profile | null>('/profile');
}

/** Persist onboarding answers; the backend derives calorie + nutrient targets. */
export function saveProfile(input: ProfileInput): Promise<Profile> {
  return request<Profile>('/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getMeals(params: ListMealsParams = {}): Promise<Meal[]> {
  const qs = new URLSearchParams();
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  if (params.meal_type) qs.set('meal_type', params.meal_type);
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<Meal[]>(`/meals${suffix}`);
}

export function getMeal(id: string): Promise<Meal> {
  return request<Meal>(`/meals/${encodeURIComponent(id)}`);
}

export interface AnalyzePayload {
  photoUri?: string | null;
  note?: string;
  meal_type?: MealType;
  location?: string;
  source?: CaptureSource;
}

/**
 * Step 1 of capture — analyze a photo/note into an editable draft. Multipart so
 * the image can ride along as a React Native file object `{ uri, name, type }`.
 * The backend does NOT write to the DB here; the user edits the draft, then
 * `createMeal()` persists it.
 */
export function analyzeCapture(payload: AnalyzePayload): Promise<CaptureDraft> {
  const form = new FormData();
  if (payload.photoUri) {
    const name = payload.photoUri.split('/').pop() || 'photo.jpg';
    const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
    const type = ext ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'image/jpeg';
    // RN FormData file shape — TS doesn't model this, hence the cast.
    form.append('photo', { uri: payload.photoUri, name, type } as unknown as Blob);
  }
  if (payload.note) form.append('note', payload.note);
  if (payload.meal_type) form.append('meal_type', payload.meal_type);
  if (payload.location) form.append('location', payload.location);
  form.append('source', payload.source ?? 'phone');

  // NOTE: do NOT set Content-Type manually; fetch adds the multipart boundary.
  return request<CaptureDraft>('/capture/analyze', { method: 'POST', body: form });
}

/** Step 2 of capture — persist a confirmed/edited draft. Items re-resolve server-side. */
export function createMeal(body: MealCreate): Promise<Meal> {
  return request<Meal>('/meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function askQuery(question: string): Promise<QueryResponse> {
  return request<QueryResponse>('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

export function getQueryExamples(): Promise<string[]> {
  return request<string[]>('/query/examples');
}

export function getStats(period: StatsPeriod = 'week'): Promise<StatsResponse> {
  return request<StatsResponse>(`/stats?period=${period}`);
}

export function getInsights(period: StatsPeriod = 'week'): Promise<InsightsResponse> {
  return request<InsightsResponse>(`/insights?period=${period}`);
}
