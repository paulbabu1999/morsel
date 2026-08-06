import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  /** Initial/again load (shows the full-screen loader). */
  reload: () => void;
  /** Silent refresh (for pull-to-refresh); does not toggle `loading`. */
  refresh: () => Promise<void>;
  refreshing: boolean;
}

/**
 * Runs an async fetcher on mount and whenever `deps` change.
 * `fn` should be stable or listed in deps.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  // Sequence guard: only the newest request may commit state, so an out-of-order
  // or post-unmount response can't overwrite fresher data.
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await run();
      if (gen === genRef.current) setData(res);
    } catch (e) {
      if (gen === genRef.current) setError(e);
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [run]);

  const refresh = useCallback(async () => {
    const gen = ++genRef.current;
    setRefreshing(true);
    try {
      const res = await run();
      if (gen === genRef.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (gen === genRef.current) setError(e);
    } finally {
      if (gen === genRef.current) setRefreshing(false);
    }
  }, [run]);

  useEffect(() => {
    load();
    return () => {
      genRef.current++; // invalidate any in-flight request on unmount / dep change
    };
  }, [load]);

  return { data, loading, error, reload: load, refresh, refreshing };
}
