import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, loadToken, login, logout, me, onAuthExpired, signup, type AuthUser } from '../api';

interface AuthContextValue {
  /** The signed-in user, or null when logged out. */
  user: AuthUser | null;
  /** False until the boot-time token check resolves. */
  loaded: boolean;
  /** Log in with email + password. Throws ApiError on bad credentials. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Create an account. Throws ApiError (e.g. 409 email taken). */
  signUp: (email: string, password: string) => Promise<void>;
  /** Clear the token and return to a logged-out state. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the authentication state for the whole app. On mount it hydrates any
 * persisted token from secure storage and validates it via GET /auth/me, so a
 * relaunch keeps the session; an invalid/expired token is quietly dropped.
 * It also listens for the api client's forced-logout signal (a protected call
 * that came back 401/403) so a stale token can never wedge the app. The auth
 * gate in App.tsx reads `user` + `loaded` to choose between login and the app.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await loadToken();
      if (!token) {
        // No stored token — nothing to validate; go straight to logged-out.
        if (alive) setLoaded(true);
        return;
      }
      try {
        const u = await me();
        if (alive) setUser(u);
      } catch (err) {
        // Only a genuine auth failure means the token is bad — clear it. A
        // network blip or cold-start timeout shouldn't nuke a possibly-valid
        // session, so we keep the token and just fall back to logged-out; a
        // later relaunch re-validates it once the backend is warm.
        const status = err instanceof ApiError ? err.status : undefined;
        if (status === 401 || status === 403) await logout();
        if (alive) setUser(null);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // A protected call returned 401/403 mid-session → force back to login.
  useEffect(() => onAuthExpired(() => setUser(null)), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await login(email, password);
    setUser({ user_id: r.user_id, email: r.email });
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const r = await signup(email, password);
    setUser({ user_id: r.user_id, email: r.email });
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loaded, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
