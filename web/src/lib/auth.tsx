import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, getToken } from "../api";
import type { AuthUser } from "../api";

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
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the authentication state for the whole app. On mount it validates any
 * persisted token via GET /auth/me so a reload keeps the session; an invalid
 * token is quietly dropped. The auth gate in App.tsx reads `user` + `loaded`
 * to decide between the login screen and the app.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!getToken()) {
      // No token — nothing to validate; go straight to logged-out.
      setLoaded(true);
      return;
    }
    api
      .me()
      .then((u) => {
        if (alive) setUser(u);
      })
      .catch(() => {
        // Expired / invalid token — drop it and stay logged out.
        if (alive) {
          api.logout();
          setUser(null);
        }
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    setUser({ user_id: r.user_id, email: r.email });
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const r = await api.signup(email, password);
    setUser({ user_id: r.user_id, email: r.email });
  }, []);

  const signOut = useCallback(() => {
    api.logout();
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
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
