import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, api } from "../api";
import type { Profile } from "../api";

interface ProfileContextValue {
  profile: Profile | null;
  /** Undefined until the first fetch resolves. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Update the cached profile after a successful save. */
  setProfile: (p: Profile) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Fetches the single user's profile once and shares it app-wide so the
 * onboarding gate and the Profile page stay in sync (a save immediately
 * clears the "needs onboarding" redirect).
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getProfile()
      .then((p) => {
        if (!alive) return;
        setProfileState(p);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    setLoaded(true);
    setError(null);
  }, []);

  return (
    <ProfileContext.Provider
      value={{ profile, loaded, loading, error, reload, setProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
