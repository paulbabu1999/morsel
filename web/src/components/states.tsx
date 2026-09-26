import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { IconAlert, IconInfo } from "./icons";

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Loading({
  label = "Loading…",
  coldStartHint = true,
}: {
  label?: string;
  /** After a few seconds, reassure that a slow response is the free server
   *  waking from sleep (Render/Neon cold start), not a hang. On by default. */
  coldStartHint?: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!coldStartHint) return;
    const t = setTimeout(() => setSlow(true), 4500);
    return () => clearTimeout(t);
  }, [coldStartHint]);
  return (
    <div className="state">
      <Spinner />
      <div className="state-msg">{label}</div>
      {slow && (
        <div className="state-hint">
          Still going — the free server may be waking from sleep. The first request
          after a quiet spell can take up to a minute. Hang tight.
        </div>
      )}
    </div>
  );
}

/** An inline reassurance that appears only if an action runs long — for
 *  button-driven waits (analyze, quick-log) where there's no full-page loader.
 *  Escalates from silent → visible after `delayMs` so a fast response shows
 *  nothing, but a cold start doesn't feel like a hang. */
export function SlowHint({
  active,
  delayMs = 4500,
  children,
}: {
  active: boolean;
  delayMs?: number;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  if (!active || !show) return null;
  return (
    <div className="state-hint state-hint-inline" role="status">
      <Spinner />
      <span>{children}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const looksOffline = /reach the backend|:8000|Failed to fetch/i.test(message);
  return (
    <div className="state error">
      <div className="state-icon">
        <IconAlert />
      </div>
      <div className="state-title">
        {looksOffline ? "Backend unavailable" : "Something went wrong"}
      </div>
      <div className="state-msg">
        {message}
        {looksOffline && (
          <>
            <br />
            <br />
            Start it from the project root:{" "}
            <code>cd backend &amp;&amp; ./run.sh</code>
          </>
        )}
      </div>
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state-icon">{icon ?? <IconInfo />}</div>
      <div className="state-title">{title}</div>
      {message && <div className="state-msg">{message}</div>}
    </div>
  );
}

/** A grid of shimmer skeletons for loading cards. */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="meal-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 300 }} />
      ))}
    </div>
  );
}
