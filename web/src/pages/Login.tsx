import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../lib/auth";
import { IconInfo } from "../components/icons";

type Mode = "login" | "signup";

/** Turn a raw API/network error into a friendly, field-agnostic message. */
function friendlyError(err: unknown, isSignup: boolean): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Wrong email or password.";
    if (err.status === 409)
      return "That email is already registered. Try logging in instead.";
    // 400/422 (e.g. password too short) carry a useful backend detail.
    if (err.message) return err.message;
    return isSignup ? "Couldn't create your account." : "Couldn't log you in.";
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Combined login / signup screen. Standalone (no app chrome) — rendered only
 * while logged out. On success the AuthProvider state flips and the App gate
 * swaps in the app; we also navigate home so the URL leaves /login.
 */
export function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>(
    location.pathname === "/signup" ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const mail = email.trim();
    if (!mail || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (isSignup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (isSignup) await signUp(mail, password);
      else await signIn(mail, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(friendlyError(err, isSignup));
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    const next: Mode = isSignup ? "login" : "signup";
    setMode(next);
    setError(null);
    navigate(`/${next}`, { replace: true });
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="7.5" stroke="#1a0f08" strokeWidth="2.4" />
              <circle cx="12" cy="12" r="2.4" fill="#1a0f08" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Morsel</div>
            <div className="brand-sub">food memory</div>
          </div>
        </div>

        <h1 className="auth-title">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="auth-sub">
          {isSignup
            ? "Sign up to start capturing meals and tracking your nutrition."
            : "Log in to pick up your food memory where you left off."}
        </p>

        <form className="grid" style={{ gap: 16 }} onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">
              Password
              {isSignup && <span className="opt"> · at least 8 characters</span>}
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "Create a password" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="stub-note auth-error" role="alert">
              <IconInfo />
              <div>{error}</div>
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            style={{ width: "100%" }}
          >
            {busy
              ? isSignup
                ? "Creating account…"
                : "Logging in…"
              : isSignup
                ? "Create account"
                : "Log in"}
          </button>
        </form>

        <div className="auth-toggle">
          {isSignup ? "Already have an account?" : "New to Morsel?"}{" "}
          <button type="button" className="auth-link" onClick={toggleMode}>
            {isSignup ? "Log in" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}
