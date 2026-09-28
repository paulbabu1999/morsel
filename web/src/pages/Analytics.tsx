import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { AsyncState } from "../lib/useAsync";
import { useAsync } from "../lib/useAsync";
import { PageHead, Kpi } from "../components/ui";
import { ErrorState, Loading } from "../components/states";
import { IconChart } from "../components/icons";

const ACCENT = "#e07a52";
const ACCENT2 = "#7cc2b0";

const num = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
const pct = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;
const shortDate = (d: string) => (d?.length >= 10 ? d.slice(5) : d);

type Range = 7 | 30 | 90;

/** A section card that renders its own loading / error / content states. */
function Section<T>({
  title,
  hint,
  state,
  children,
}: {
  title: string;
  hint?: string;
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <section className="card card-pad" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div className="card-title">{title}</div>
        {hint && <div className="card-hint">{hint}</div>}
      </div>
      {state.loading && <Loading label={`Loading ${title.toLowerCase()}…`} />}
      {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
      {state.data && !state.loading && children(state.data)}
    </section>
  );
}

/** Horizontal bars for a small { label: count } map — compact, no chart lib. */
function DistBars({
  data,
  color = ACCENT,
  empty = "No data yet",
}: {
  data: Record<string, number>;
  color?: string;
  empty?: string;
}) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <div className="card-hint">{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(([k, v]) => (
        <div
          key={k}
          style={{ display: "grid", gridTemplateColumns: "130px 1fr 52px", alignItems: "center", gap: 10 }}
        >
          <span
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={k}
          >
            {k}
          </span>
          <span style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, height: 10 }}>
            <span
              style={{ display: "block", width: `${(v / max) * 100}%`, background: color, height: "100%", borderRadius: 6 }}
            />
          </span>
          <span style={{ fontSize: 13, textAlign: "right" }}>{num(v)}</span>
        </div>
      ))}
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
};
const cellHead: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "var(--text-muted)",
  fontWeight: 600,
  borderBottom: "1px solid var(--grid)",
  whiteSpace: "nowrap",
};
const cell: CSSProperties = { padding: "6px 8px", whiteSpace: "nowrap" };

export function Analytics() {
  const [range, setRange] = useState<Range>(30);

  const overview = useAsync(() => api.analytics.overview(), []);
  const growth = useAsync(() => api.analytics.growth(range), [range]);
  const retention = useAsync(() => api.analytics.retention(8), []);
  const outcomes = useAsync(() => api.analytics.outcomes(), []);
  const engagement = useAsync(() => api.analytics.engagement(range), [range]);
  const system = useAsync(() => api.analytics.system(range <= 7 ? 7 : range), [range]);

  const RangeButton = ({ v, label }: { v: Range; label: string }) => (
    <button
      type="button"
      onClick={() => setRange(v)}
      className="btn btn-sm"
      style={{
        background: range === v ? ACCENT : "transparent",
        color: range === v ? "#1a0f08" : "var(--text-muted)",
        border: "1px solid var(--grid)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="page">
      <PageHead
        eyebrow="Operator"
        title="Analytics"
        subtitle="How Bite is doing — growth, engagement, retention, and outcomes across all users."
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            <RangeButton v={7} label="7d" />
            <RangeButton v={30} label="30d" />
            <RangeButton v={90} label="90d" />
          </div>
        }
      />

      {/* --- headline KPIs --- */}
      {overview.loading && <Loading label="Loading overview…" />}
      {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
      {overview.data && !overview.loading && (
        <div style={gridStyle}>
          <Kpi
            label="Weekly active loggers"
            value={num(overview.data.weekly_active_loggers)}
            foot="North Star · logged in last 7d"
            accent={ACCENT}
            icon={<IconChart />}
          />
          <Kpi label="Total users" value={num(overview.data.total_users)} foot={`+${overview.data.new_users_7d} this week`} />
          <Kpi label="New (30d)" value={num(overview.data.new_users_30d)} foot={`${overview.data.new_users_1d} today`} />
          <Kpi label="Active today" value={num(overview.data.daily_active_loggers)} foot="logged a meal today" />
          <Kpi label="Adherent (7d)" value={num(overview.data.adherent_loggers_7d)} foot="logged ≥3 days/wk" accent={ACCENT2} />
          <Kpi label="Total meals" value={num(overview.data.total_meals)} foot={`${overview.data.meals_7d} in last 7d`} />
          <Kpi label="App opens (DAU)" value={num(overview.data.app_open_dau)} foot={`${overview.data.app_open_wau} this week`} />
          <Kpi label="DB size" value={overview.data.db_size_mb} unit="MB" foot={`${num(overview.data.total_events)} events`} />
        </div>
      )}

      {/* --- growth --- */}
      <Section title="User growth" hint={`cumulative accounts · ${range}d`} state={growth}>
        {(g) => (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={g.by_day} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip labelFormatter={shortDate} />
              <Area type="monotone" dataKey="cumulative_users" name="Users" stroke={ACCENT} fill="url(#cumGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Daily activity" hint={`signups + active loggers · ${range}d`} state={growth}>
        {(g) => (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={g.by_day} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip labelFormatter={shortDate} />
              <Line type="monotone" dataKey="active_loggers" name="Active loggers" stroke={ACCENT} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="signups" name="Signups" stroke={ACCENT2} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* --- retention --- */}
      <Section title="Weekly retention" hint="cohort by signup week → % logging in later weeks" state={retention}>
        {(r) =>
          r.cohorts.length === 0 ? (
            <div className="card-hint">No cohorts yet</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={cellHead}>Cohort</th>
                    <th style={cellHead}>Users</th>
                    {Array.from({ length: r.weeks + 1 }).map((_, k) => (
                      <th key={k} style={{ ...cellHead, textAlign: "center" }}>
                        W{k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.cohorts.map((c) => (
                    <tr key={c.cohort_start}>
                      <td style={cell}>{c.cohort_start}</td>
                      <td style={cell}>{c.size}</td>
                      {c.retained.map((v, k) => {
                        const p = c.size ? v / c.size : 0;
                        return (
                          <td
                            key={k}
                            style={{
                              ...cell,
                              textAlign: "center",
                              background: c.size ? `rgba(224,122,82,${(0.08 + p * 0.62).toFixed(3)})` : "transparent",
                              color: p > 0.55 ? "#1a0f08" : undefined,
                            }}
                            title={`${v} of ${c.size}`}
                          >
                            {c.size ? `${Math.round(p * 100)}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Section>

      {/* --- outcomes --- */}
      <Section title="Outcomes" hint="does it actually help people?" state={outcomes}>
        {(o) => (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={gridStyle}>
              <Kpi label="Tracking weight" value={num(o.users_tracking_weight)} foot="≥2 weigh-ins" />
              <Kpi
                label="Moving toward goal"
                value={pct(o.weight_90d.pct_toward_goal)}
                foot={`${o.weight_90d.users} users · 90d`}
                accent={ACCENT2}
              />
              <Kpi
                label="Avg weight change"
                value={o.weight_90d.avg_change_kg}
                unit="kg"
                foot="90-day, goal-setters"
              />
              <Kpi label="Calorie adherence" value={pct(o.calorie_adherence)} foot="days within ±20% of target" />
              <Kpi label="Protein adherence" value={pct(o.protein_adherence)} foot="days ≥90% of target" accent={ACCENT} />
              <Kpi label="Has a goal" value={num(o.users_with_goal)} foot="set lose/maintain/gain" />
            </div>
            <div>
              <div className="card-hint" style={{ marginBottom: 8 }}>Goal distribution</div>
              <DistBars data={o.goal_distribution} color={ACCENT2} />
            </div>
          </div>
        )}
      </Section>

      {/* --- engagement --- */}
      <Section title="Engagement" hint={`behavioral events · ${range}d`} state={engagement}>
        {(e) => (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={gridStyle}>
              <Kpi label="Queries asked" value={num(e.query_volume)} foot={`${pct(e.query_ok_rate)} answered`} />
              <Kpi label="Edits" value={num(e.edits)} />
              <Kpi label="Deletes" value={num(e.deletes)} />
              <Kpi label="Refines (Fix it)" value={num(e.refines)} />
              <Kpi label="Weigh-ins" value={num(e.weigh_ins)} />
              <Kpi label="Meals / active logger" value={e.meals_per_active_logger_7d} foot="last 7d" />
            </div>
            <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div>
                <div className="card-hint" style={{ marginBottom: 8 }}>Capture method</div>
                <DistBars data={e.capture_methods} />
              </div>
              <div>
                <div className="card-hint" style={{ marginBottom: 8 }}>Query routes</div>
                <DistBars data={e.query_routes} color={ACCENT2} />
              </div>
              <div>
                <div className="card-hint" style={{ marginBottom: 8 }}>Device (meal source)</div>
                <DistBars data={e.device_mix} />
              </div>
              <div>
                <div className="card-hint" style={{ marginBottom: 8 }}>Meal types</div>
                <DistBars data={e.meal_types} color={ACCENT2} />
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* --- system health --- */}
      <Section title="System health" hint={`quality + performance · ${range <= 7 ? 7 : range}d`} state={system}>
        {(s) => {
          const cap = s.event_latency_ms["capture_analyze"];
          const qry = s.event_latency_ms["query_asked"];
          return (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={gridStyle}>
                <Kpi
                  label="LLM fallback rate"
                  value={pct(s.llm_fallback_rate)}
                  foot={`${num(s.llm_calls)} AI calls`}
                  accent={s.llm_fallback_rate > 0.2 ? "#d9534f" : ACCENT2}
                />
                <Kpi label="Entity resolution" value={pct(s.entity_resolution_rate)} foot="items matched to a food" />
                <Kpi label="Zero-kcal meals" value={pct(s.zero_kcal_meal_rate)} foot="resolution misses" />
                <Kpi label="Low-confidence meals" value={pct(s.low_confidence_meal_rate)} foot="confidence < 0.5" />
                <Kpi label="Capture p95" value={cap?.p95 != null ? num(cap.p95) : "—"} unit="ms" foot={cap?.p50 != null ? `p50 ${num(cap.p50)}ms` : undefined} />
                <Kpi label="Query p95" value={qry?.p95 != null ? num(qry.p95) : "—"} unit="ms" foot={qry?.p50 != null ? `p50 ${num(qry.p50)}ms` : undefined} />
              </div>
              <div>
                <div className="card-hint" style={{ marginBottom: 8 }}>Events per day</div>
                {s.events_by_day.length === 0 ? (
                  <div className="card-hint">No events yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={s.events_by_day} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--grid)" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                      <Tooltip labelFormatter={shortDate} />
                      <Bar dataKey="count" name="Events" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <div className="card-hint" style={{ marginBottom: 8 }}>Food catalog composition</div>
                <DistBars data={s.catalog_composition} color={ACCENT2} />
              </div>
            </div>
          );
        }}
      </Section>
    </div>
  );
}
