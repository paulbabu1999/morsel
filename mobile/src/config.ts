/**
 * App configuration.
 *
 * IMPORTANT — API_URL:
 *   `localhost` only resolves to your dev machine when the app runs in a web
 *   browser or an iOS simulator on the SAME machine. On a PHYSICAL device (or an
 *   Android emulator) `localhost` points at the device itself, NOT your computer,
 *   so the app will fail to reach the backend (contract v2 lives at :8000).
 *
 *   To run on a real phone via Expo Go:
 *     1. Find your machine's LAN IP (macOS: `ipconfig getifaddr en0`,
 *        or System Settings → Wi-Fi → Details).
 *     2. Replace the value below with e.g. `http://192.168.1.42:8000`.
 *     3. Make sure the backend is started with host 0.0.0.0 (it is, via run.sh)
 *        and the phone is on the same Wi-Fi network.
 */
// Hosted backend (Render). Works anywhere — no LAN/same-wifi requirement.
// For local backend dev, swap to your machine's LAN IP, e.g. http://192.168.x.x:8000
export const API_URL = 'https://morsel-api-9s89.onrender.com';

/** Network request timeout in milliseconds. */
export const REQUEST_TIMEOUT_MS = 12000;

/**
 * Longer timeout for auth calls (login / signup / boot-time /auth/me).
 * The hosted backend runs on Render's free tier, so the FIRST request after it
 * has idled cold-starts and can take 30–60s. Auth is almost always that first
 * call, so it gets extra headroom before we give up and show a timeout error.
 */
export const AUTH_REQUEST_TIMEOUT_MS = 30000;
