import type { AdequacyStatus } from "../api";
import { formatNumber } from "../lib/format";

/* ---------- Portion size guide ---------- *
 * The hand method: a no-tools way to eyeball servings when you don't have a
 * photo or a scale. Shown as a subtle disclosure in the meal editor so it helps
 * users set realistic quantities without cluttering the form. */
const PORTION_REFS: { hand: string; ref: string; desc: string }[] = [
  { hand: "🖐️", ref: "Palm", desc: "≈ 1 serving of protein (chicken, fish, tofu)" },
  { hand: "✊", ref: "Fist", desc: "≈ 1 cup — veggies or a bowl of salad" },
  { hand: "🤲", ref: "Cupped hand", desc: "≈ ½ cup cooked carbs (rice, pasta, oats)" },
  { hand: "👍", ref: "Thumb", desc: "≈ 1 tbsp fats (oil, butter, nut butter)" },
];

export function PortionTips() {
  return (
    <details className="portion-tips">
      <summary>
        <span>📏 Not sure on quantity? Use your hand</span>
      </summary>
      <div className="portion-tips-body">
        <div className="portion-grid">
          {PORTION_REFS.map((p) => (
            <div className="portion-item" key={p.ref}>
              <span className="portion-hand" aria-hidden>
                {p.hand}
              </span>
              <div>
                <div className="portion-ref">{p.ref}</div>
                <div className="portion-desc">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="portion-plate">
          <b>Plate method:</b> fill half with veggies, a quarter with protein, a
          quarter with carbs.
        </div>
      </div>
    </details>
  );
}

/* ---------- Status colors (shared by ring + adequacy bars) ---------- */
export const STATUS_META: Record<
  AdequacyStatus,
  { color: string; label: string }
> = {
  low: { color: "#f0a742", label: "Low" }, // amber — under a target
  ok: { color: "#22c58b", label: "On track" }, // green
  high: { color: "#3987e5", label: "High" }, // blue — above target / near limit
  // "Over" a limit is still shown, but in the same calm terracotta as the
  // calorie ring's over-goal tone — informative, never an alarm red (per the
  // psychology review: don't make being over obvious/shaming).
  over: { color: "#d98a5e", label: "Over" },
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
  const dash = Math.min(ratio, 1) * circ;
  const remaining = target - value;

  // Calm warm fill; just a gentler, slightly deeper tone once over goal — never
  // an alarm red (a single day over is noise, and shaming the number is what
  // makes people quit).
  const from = over ? "#E0967B" : "#F0B48C";
  const to = over ? "#D98A5E" : "#E79070";

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
          style={{ color: over ? "var(--text-muted)" : "var(--good)" }}
        >
          {over
            ? `${formatNumber(Math.abs(remaining))} over`
            : `${formatNumber(remaining)} left`}
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
  hero = false,
  hint,
}: {
  label: string;
  amount: number;
  target: number | null;
  unit: string;
  pct: number | null;
  status: AdequacyStatus;
  kind: "target" | "limit";
  digits?: number;
  /** Emphasize this nutrient as the one that matters most (protein). */
  hero?: boolean;
  /** A one-line "why it matters" cue shown under the bar. */
  hint?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  const fill = Math.min(Math.max(pct ?? 0, 0), 100);
  return (
    <div
      className={`adq-row${hero ? " adq-row-hero" : ""}`}
      style={{ ["--adq-color" as string]: meta.color }}
    >
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
      {hint && <div className="adq-hint">{hint}</div>}
    </div>
  );
}
