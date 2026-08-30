import { useState } from "react";
import { ApiError, api } from "../api";
import type { WeightEntry } from "../api";
import { useAsync } from "../lib/useAsync";
import { Loading } from "./states";

/** Exponential moving average — the smoothed line that ignores daily water-weight
 *  noise (the thing that discourages people and drives quitting). */
function ema(values: number[], alpha = 0.25): number[] {
  const out: number[] = [];
  let prev = values[0];
  for (const v of values) {
    prev = out.length === 0 ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Weight progress: a smoothed trend, never the raw daily verdict. Losing shows a
 *  gentle green; up is neutral (a single weigh-in is noise, not failure). */
export function WeightCard() {
  const { data, loading, error, reload } = useAsync<WeightEntry[]>(() => api.getWeights(), []);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function logIt(e: React.FormEvent) {
    e.preventDefault();
    const kg = Number(value);
    if (!kg || kg < 20 || kg > 400 || saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await api.logWeight(kg);
      setValue("");
      reload();
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const weights = data ?? [];
  const trend = weights.length ? ema(weights.map((w) => w.weight_kg)) : [];
  const smoothedNow = trend.length ? trend[trend.length - 1] : null;
  // Change is measured on the SMOOTHED line, so a random heavy day never reads as
  // "you gained".
  const change = trend.length >= 2 ? trend[trend.length - 1] - trend[0] : 0;
  const losing = change < -0.1;

  return (
    <section className="card card-pad">
      <div className="card-head">
        <div className="card-title">Weight trend</div>
        {smoothedNow != null && (
          <div className="card-hint">
            {weights.length} weigh-in{weights.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {loading && <Loading label="Loading…" />}

      {!loading && weights.length === 0 && (
        <div className="card-hint" style={{ marginBottom: 14 }}>
          Log your weight now and then — you'll see a smoothed trend, so a normal daily
          fluctuation never throws you off.
        </div>
      )}

      {!loading && smoothedNow != null && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)" }}>
              {smoothedNow.toFixed(1)}
              <span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 600 }}> kg</span>
            </div>
            {trend.length >= 2 && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: losing ? "var(--good)" : "var(--text-muted)",
                }}
                title="Change across your logged range (smoothed)"
              >
                {change <= 0 ? "▾" : "▴"} {Math.abs(change).toFixed(1)} kg
              </div>
            )}
          </div>
          <Sparkline raw={weights.map((w) => w.weight_kg)} trend={trend} />
        </>
      )}

      {error && !weights.length && (
        <div className="card-hint" style={{ color: "var(--danger)" }}>{error}</div>
      )}

      <form onSubmit={logIt} style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input
          className="input"
          type="number"
          step="0.1"
          min={20}
          max={400}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Today's weight (kg)"
          style={{ flex: 1 }}
          aria-label="Weight in kilograms"
        />
        <button className="btn btn-primary" type="submit" disabled={saving || !value}>
          {saving ? "Saving…" : "Log"}
        </button>
      </form>
      {saveErr && <div className="card-hint" style={{ marginTop: 8, color: "var(--danger)" }}>{saveErr}</div>}
    </section>
  );
}

/** Faint raw points + a prominent smoothed trend line. */
function Sparkline({ raw, trend }: { raw: number[]; trend: number[] }) {
  const w = 320;
  const h = 72;
  const pad = 6;
  const all = [...raw, ...trend];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const n = raw.length;
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad));
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad);
  const line = trend.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} preserveAspectRatio="none">
      {raw.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2} fill="var(--surface-3)" />
      ))}
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
