import type { ReactNode } from "react";
import { IconAlert, IconInfo } from "./icons";

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state">
      <Spinner />
      <div className="state-msg">{label}</div>
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
