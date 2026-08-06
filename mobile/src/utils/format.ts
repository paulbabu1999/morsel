/** Small formatting helpers. Timestamps from the API are naive local ISO. */

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse a naive ISO string ("2026-07-22T19:59:00") as local time. */
export function parseLocal(iso: string): Date {
  // Backend sends naive local ISO (no timezone); strip any trailing Z
  // defensively so it's never interpreted as UTC and shifted. Returns an
  // Invalid Date on bad input (callers guard) rather than masking it as "now".
  return new Date((iso || '').replace(/Z$/, ''));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeStr(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** "Today 7:59 PM", "Yesterday 1:10 PM", or "Tue, Jul 21 · 8:10 PM". */
export function formatWhen(iso: string): string {
  const d = parseLocal(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(d, now)) return `Today · ${timeStr(d)}`;
  if (isSameDay(d, yesterday)) return `Yesterday · ${timeStr(d)}`;
  return `${DAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()} · ${timeStr(d)}`;
}

/** "Jul 16" from a date-only string ("2026-07-16") or ISO. */
export function formatShortDate(dateStr: string): string {
  const d = parseLocal(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr ?? '');
  return `${MONTH[d.getMonth()]} ${d.getDate()}`;
}

/** Weekday initial ("M", "T", ...) for a date-only string. */
export function weekdayInitial(dateStr: string): string {
  const d = parseLocal(`${dateStr}T00:00:00`);
  return DAY[d.getDay()].charAt(0);
}

export function round(n: number, dp = 0): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** 1234 -> "1,234" */
export function withCommas(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
