import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type {
  AdequacyStatus,
  InsightsResponse,
  InsightSeverity,
  StatsResponse,
} from "../api";
import { useAsync } from "../lib/useAsync";
import { useProfile } from "../lib/profile";
import {
  formatNumber,
  formatPercent,
  startOfDayISO,
  weekdayLabel,
} from "../lib/format";
import { PageHead, Kpi } from "../components/ui";
import { ErrorState, Loading, EmptyState } from "../components/states";
import { MealCardCompact } from "../components/MealCard";
import { CalorieRing, NutrientBar } from "../components/nutrition";
import {
  IconBolt,
  IconFlame,
  IconLeaf,
  IconPlate,
  IconStore,
  IconTarget,
} from "../components/icons";

type Period = "day" | "week" | "month";

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "#3987e5",
  lunch: "#d95926",
  dinner: "#22c58b",
  snack: "#c98500",
};
const MEAL_TYPE_ORDER = ["breakfast", "lunch", "dinner", "snack"];

/** Simple status for locally-computed macro bars (targets to hit). */
function targetStatus(pct: number): AdequacyStatus {
  if (pct < 70) return "low";
  if (pct <= 115) return "ok";
  return "high";
}

const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  info: "#6f7889",
  suggest: "#3987e5",
  watch: "#f0a742",
};

function InsightsCard({
  data,
  rangeLabel,
}: {
  data: InsightsResponse;
  rangeLabel: string;
}) {
  return (
    <section className="card card-pad section-gap">
      <div className="card-head">
        <div className="card-title">Insights</div>
        <div className="card-hint">actionable · {rangeLabel}</div>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        {data.headline}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {data.insights.map((i, idx) => (
          <div
            key={idx}
            style={{
              borderLeft: `3px solid ${SEVERITY_COLOR[i.severity]}`,
              padding: "8px 0 8px 14px",
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
              {i.title}
            </div>
            <div style={{ fontSize: 13.5, color: "#98a2b3", lineHeight: 1.5 }}>
              {i.detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Dashboard() {
  const [period, setPeriod] = useState<Period>("day");
  // Refetch when the profile changes so a target update on the Profile page
  // reflects here (targets ride along in /stats and /insights).
  const { profile } = useProfile();
  const profileKey = profile?.updated_at ?? "";
  const stats = useAsync<StatsResponse>(() => api.getStats(period), [period, profileKey]);
  const today = useAsync(() => api.listMeals({ start: startOfDayISO() }), []);

  return (
    <>
      <PageHead
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Your eating patterns at a glance — calories against your goal, nutrient adequacy, and where the food came from."
        actions={
          <div className="segmented" role="tablist" aria-label="Time period">
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}
              >
                {p === "day" ? "Today" : p === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        }
      />

      {stats.loading && <Loading label="Crunching your stats…" />}
      {stats.error && <ErrorState message={stats.error} onRetry={stats.reload} />}

      {stats.data && !stats.loading && (
        <DashboardBody stats={stats.data} period={period} today={today} />
      )}
    </>
  );
}

function DashboardBody({
  stats,
  period,
  today,
}: {
  stats: StatsResponse;
  period: Period;
  today: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.listMeals>>>>;
}) {
  const rangeLabel =
    period === "day" ? "today" : period === "week" ? "this week" : "this month";

  const chartData = stats.by_day.map((d) => ({
    label: period === "month" ? d.date.slice(8) : weekdayLabel(d.date),
    date: d.date,
    calories: d.calories,
    protein: d.protein_g,
    meals: d.meals,
  }));

  const maxTopFood = Math.max(1, ...stats.top_foods.map((f) => f.count));
  const maxMealType = Math.max(1, ...Object.values(stats.by_meal_type));

  const targets = stats.targets;
  const numDays = Math.max(1, stats.by_day.length);
  const ringValue =
    period === "day" ? stats.total_calories : stats.avg_calories_per_day;
  const ringCaption =
    period === "day" ? "today's intake" : `avg / day, ${rangeLabel}`;

  // Macro bars (per-day averages vs profile targets).
  const proteinAdq = stats.adequacy.find((a) => a.nutrient === "protein_g");
  const avgCarbs =
    stats.by_day.reduce((s, d) => s + d.carbs_g, 0) / numDays;
  const avgFat = stats.by_day.reduce((s, d) => s + d.fat_g, 0) / numDays;

  // Micros = everything in adequacy except protein (shown as a macro above).
  const micros = stats.adequacy.filter((a) => a.nutrient !== "protein_g");

  const { profile } = useProfile();
  const insights = useAsync<InsightsResponse>(
    () => api.getInsights(period),
    [period, profile?.updated_at ?? ""],
  );

  return (
    <>
      {/* ---- Calorie goal + macros ---- */}
      {targets ? (
        <div className="grid two-col">
          <section className="card card-pad">
            <div className="card-head">
              <div className="card-title">Calories vs goal</div>
              <div className="card-hint">
                target {formatNumber(targets.daily_calorie_target)} kcal / day
              </div>
            </div>
            <CalorieRing
              value={ringValue}
              target={targets.daily_calorie_target}
              caption={ringCaption}
            />
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <div className="card-title">Macros / day</div>
              <div className="card-hint">avg vs target, {rangeLabel}</div>
            </div>
            <div className="adq-list">
              {proteinAdq ? (
                <NutrientBar
                  label="Protein"
                  amount={proteinAdq.amount}
                  target={proteinAdq.target}
                  unit={proteinAdq.unit}
                  pct={proteinAdq.pct}
                  status={proteinAdq.status}
                  kind={proteinAdq.kind}
                />
              ) : (
                <NutrientBar
                  label="Protein"
                  amount={stats.avg_protein_per_day}
                  target={targets.protein_target_g}
                  unit="g"
                  pct={(stats.avg_protein_per_day / targets.protein_target_g) * 100}
                  status={targetStatus(
                    (stats.avg_protein_per_day / targets.protein_target_g) * 100,
                  )}
                  kind="target"
                />
              )}
              <NutrientBar
                label="Carbs"
                amount={avgCarbs}
                target={targets.carb_target_g}
                unit="g"
                pct={(avgCarbs / targets.carb_target_g) * 100}
                status={targetStatus((avgCarbs / targets.carb_target_g) * 100)}
                kind="target"
              />
              <NutrientBar
                label="Fat"
                amount={avgFat}
                target={targets.fat_target_g}
                unit="g"
                pct={(avgFat / targets.fat_target_g) * 100}
                status={targetStatus((avgFat / targets.fat_target_g) * 100)}
                kind="target"
              />
            </div>
          </section>
        </div>
      ) : (
        <ProfilePrompt />
      )}

      {/* ---- Micronutrient adequacy ---- */}
      {targets && micros.length > 0 && (
        <section className="card card-pad section-gap">
          <div className="card-head">
            <div className="card-title">Nutrition adequacy</div>
            <div className="card-hint">
              per-day average vs targets &amp; limits, {rangeLabel}
            </div>
          </div>
          <div className="adequacy-grid">
            {micros.map((a) => (
              <NutrientBar
                key={a.nutrient}
                label={a.label}
                amount={a.amount}
                target={a.target}
                unit={a.unit}
                pct={a.pct}
                status={a.status}
                kind={a.kind}
                digits={a.unit === "mg" ? 0 : 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Insights / advice ---- */}
      {insights.data && insights.data.insights.length > 0 && (
        <InsightsCard data={insights.data} rangeLabel={rangeLabel} />
      )}

      {/* ---- KPI cards ---- */}
      <div className="kpi-grid section-gap">
        <Kpi
          label="Total calories"
          value={formatNumber(stats.total_calories)}
          unit="kcal"
          foot={`across ${stats.total_meals} meals ${rangeLabel}`}
          accent="#ff8a4c"
          icon={<IconFlame />}
        />
        <Kpi
          label="Avg calories / day"
          value={formatNumber(stats.avg_calories_per_day)}
          unit="kcal"
          accent="#ff5e7e"
          icon={<IconBolt />}
        />
        <Kpi
          label="Avg protein / day"
          value={formatNumber(stats.avg_protein_per_day, 1)}
          unit="g"
          accent="#22c58b"
          icon={<IconLeaf />}
        />
        <Kpi
          label="Meals logged"
          value={stats.total_meals}
          foot={`${stats.start} → ${stats.end}`}
          accent="#3987e5"
          icon={<IconPlate />}
        />
        <Kpi
          label="Eat-out rate"
          value={formatPercent(stats.eat_out_rate)}
          foot={`${stats.eat_out_meals} meals out`}
          accent="#c98500"
          icon={<IconStore />}
        />
      </div>

      {/* Calories chart + meal-type breakdown */}
      <div className="grid two-col">
        <section className="card card-pad">
          <div className="card-head">
            <div className="card-title">Calories by day</div>
            <div className="card-hint">kcal per day, {rangeLabel}</div>
          </div>
          {chartData.length === 0 ? (
            <EmptyState title="No data for this period" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 6, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9a5a" />
                    <stop offset="100%" stopColor="#ff5e7e" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v) => `${Math.round(v / 100) / 10}k`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(v: number) => [`${formatNumber(v)} kcal`, "Calories"]}
                  labelFormatter={(_l, p) =>
                    p?.[0] ? (p[0].payload as { date: string }).date : ""
                  }
                />
                <Bar
                  dataKey="calories"
                  fill="url(#calGrad)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={54}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div className="card-title">By meal type</div>
            <div className="card-hint">meals</div>
          </div>
          <div>
            {MEAL_TYPE_ORDER.map((mt) => {
              const count = stats.by_meal_type[mt] ?? 0;
              return (
                <div className="mt-row" key={mt}>
                  <span className="mt-name">{mt}</span>
                  <div className="mt-track">
                    <div
                      className="mt-fill"
                      style={{
                        width: `${(count / maxMealType) * 100}%`,
                        background: MEAL_TYPE_COLORS[mt],
                      }}
                    />
                  </div>
                  <span className="mt-count">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="card-hint" style={{ marginTop: 16 }}>
            Protein tracks the highest on {" "}
            {chartData.length
              ? chartData.reduce((a, b) => (b.protein > a.protein ? b : a)).label
              : "—"}
            .
          </div>
        </section>
      </div>

      {/* Top foods + today's meals */}
      <div className="grid dash-lower section-gap">
        <section className="card card-pad">
          <div className="card-head">
            <div className="card-title">Top foods</div>
            <div className="card-hint">most logged, {rangeLabel}</div>
          </div>
          {stats.top_foods.length === 0 ? (
            <EmptyState title="No foods logged yet" />
          ) : (
            <div>
              {stats.top_foods.slice(0, 7).map((f) => (
                <div className="rank-row" key={f.name}>
                  <span className="rank-name">{f.name}</span>
                  <div className="rank-bar-track">
                    <div
                      className="rank-bar"
                      style={{ width: `${(f.count / maxTopFood) * 100}%` }}
                    />
                  </div>
                  <span className="rank-count">{f.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div className="card-title">Today's meals</div>
            <div className="card-hint">
              {today.data ? `${today.data.length} logged` : ""}
            </div>
          </div>
          {today.loading && <Loading label="Loading today…" />}
          {today.error && <ErrorState message={today.error} onRetry={today.reload} />}
          {today.data && today.data.length === 0 && (
            <EmptyState
              title="Nothing logged today"
              message="Head to Capture to log your first meal of the day."
            />
          )}
          {today.data && today.data.length > 0 && (
            <div className="grid" style={{ gap: 10 }}>
              {today.data.map((m) => (
                <MealCardCompact key={m.id} meal={m} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Shown when the user has no profile yet — a gentle nudge to onboarding. */
function ProfilePrompt() {
  return (
    <section className="card card-pad">
      <div className="state" style={{ padding: "34px 20px" }}>
        <div className="state-icon" style={{ color: "var(--brand)" }}>
          <IconTarget />
        </div>
        <div className="state-title">Set up your profile to unlock the calorie ring</div>
        <div className="state-msg">
          Add your age, weight, and goal and Bite will compute a daily calorie
          target plus personalized nutrient goals to track against.
        </div>
        <Link to="/profile" className="btn btn-primary" style={{ marginTop: 6 }}>
          <IconTarget />
          Set up profile
        </Link>
      </div>
    </section>
  );
}
