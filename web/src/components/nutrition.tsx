import type { AdequacyStatus } from "../api";
import { formatNumber } from "../lib/format";

/* ---------- Status colors (shared by ring + adequacy bars) ---------- */
export const STATUS_META: Record<
  AdequacyStatus,
  { color: string; label: string }
> = {
  low: { color: "#f0a742", label: "Low" }, // amber — under a target
  ok: { color: "#22c58b", label: "On track" }, // green
  high: { color: "#3987e5", label: "High" }, // blue — above target / near limit
  over: { color: "#e66767", label: "Over" }, // red — exceeded a limit
  unknown: { color: "#6f7889", label: "No target" }, // gray
};

/* ---------- Calorie ring ---------- */
export function CalorieRing({
  value,
  target,
  caption,
}: {
  value: number;
  target: number;
  caption: string;
}) {
  const size = 208;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = target > 0 ? value / target : 0;
  const over = value > target;
  const pct = Math.round(ratio * 100);
  const dash = Math.min(ratio, 1) * circ;
  const remaining = target - value;

  // Green while under, red once over the goal.
  const from = over ? "#e66767" : "#ff9a5a";
  const to = over ? "#ff5e7e" : "#ff5e7e";

  return (
    <div className="cal-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="cal-ring-center">
        <div className="cal-ring-value">{formatNumber(value)}</div>
        <div className="cal-ring-target">of {formatNumber(target)} kcal</div>
        <div
          className="cal-ring-rem"
          style={{ color: over ? "var(--danger)" : "var(--good)" }}
        >
          {over
            ? `${formatNumber(Math.abs(remaining))} over`
            : `${formatNumber(remaining)} left`}
          <span className="cal-ring-pct"> · {pct}%</span>
        </div>
      </div>
      <div className="cal-ring-caption">{caption}</div>
    </div>
  );
}

/* ---------- Adequacy / macro progress bar ---------- */
export function NutrientBar({
  label,
  amount,
  target,
  unit,
  pct,
  status,
  kind,
  digits = 0,
}: {
  label: string;
  amount: number;
  target: number | null;
  unit: string;
  pct: number | null;
  status: AdequacyStatus;
  kind: "target" | "limit";
  digits?: number;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  const fill = Math.min(Math.max(pct ?? 0, 0), 100);
  return (
    <div className="adq-row" style={{ ["--adq-color" as string]: meta.color }}>
      <div className="adq-head">
        <span className="adq-label">
          {label}
          <span className={`adq-kind adq-kind-${kind}`}>
            {kind === "limit" ? "limit" : "goal"}
          </span>
        </span>
        <span className="adq-amount">
          {formatNumber(amount, digits)}
          <span className="adq-unit">
            {" "}
            / {formatNumber(target, digits)} {unit}
          </span>
        </span>
      </div>
      <div className="adq-track">
        <div className="adq-fill" style={{ width: `${fill}%` }} />
        {kind === "target" && (
          // marker at 100% so "hit the goal" reads clearly
          <span className="adq-goal-mark" />
        )}
      </div>
      <div className="adq-foot">
        <span className="adq-status" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="adq-pct">{pct == null ? "—" : `${Math.round(pct)}%`}</span>
      </div>
    </div>
  );
}
