/** Formatting + date helpers. Backend timestamps are naive local ISO (no Z). */

/** Parse a naive local ISO string ("2026-07-22T19:59:00") as local time. */
export function parseLocal(iso: string): Date {
  // Strip any trailing Z just in case; the Date ctor treats a bare
  // "YYYY-MM-DDTHH:mm:ss" as local time, which is what we want.
  return new Date(iso.replace(/Z$/, ""));
}

/** Local ISO string at 00:00:00 for a given date (default: today). */
export function startOfDayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00`;
}

/** "YYYY-MM-DD" for <input type=date>, in local time. */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTime(iso: string): string {
  return parseLocal(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return parseLocal(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/**
 * A short, kind relative time for the social feed ("just now", "2h ago",
 * "3d ago"). Falls back to a calendar date once things are more than a week
 * old, so the feed never reads like a stopwatch.
 */
export function timeAgo(iso: string): string {
  const then = parseLocal(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/** Short weekday label for a "YYYY-MM-DD" date string (chart axis). */
export function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Turn a snake_case / arbitrary key into a readable label. */
export function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bg\b/g, "(g)")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pretty-print a `data` value from the query response. */
export function formatDataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return formatNumber(value, 1);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
