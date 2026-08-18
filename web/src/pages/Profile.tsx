import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import type {
  ActivityLevel,
  GoalType,
  Profile as ProfileType,
  ProfileInput,
  Sex,
} from "../api";
import { useProfile } from "../lib/profile";
import { formatNumber, titleCase } from "../lib/format";
import { PageHead } from "../components/ui";
import { ErrorState, Loading } from "../components/states";
import {
  IconCheck,
  IconFlame,
  IconInfo,
  IconTarget,
  IconUser,
} from "../components/icons";

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
];
const GOALS: { value: GoalType; label: string }[] = [
  { value: "lose", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "gain", label: "Gain weight" },
];
const RATES = ["0.25kg/week", "0.5kg/week", "0.75kg/week", "1kg/week"];

interface FormState {
  age: string;
  sex: Sex;
  height_cm: string;
  weight_kg: string;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate: string;
}

function fromProfile(p: ProfileType | null): FormState {
  return {
    age: p ? String(p.age) : "",
    sex: p?.sex ?? "male",
    height_cm: p ? String(p.height_cm) : "",
    weight_kg: p ? String(p.weight_kg) : "",
    activity_level: p?.activity_level ?? "moderate",
    goal_type: p?.goal_type ?? "maintain",
    goal_rate: p?.goal_rate ?? "0.5kg/week",
  };
}

export function Profile() {
  const { profile, loading, error, reload, setProfile } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnboarding = !profile;
  // Local flag: onboarding users who just saved should be able to jump to the app.
  const justArrived = (location.state as { onboarding?: boolean } | null)?.onboarding;

  if (loading) return <Loading label="Loading your profile…" />;
  if (error && !profile) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHead
        eyebrow={isOnboarding ? "Welcome" : "You"}
        title={isOnboarding ? "Set up your profile" : "Your profile"}
        subtitle={
          isOnboarding
            ? "Tell Bite a bit about you and it will compute a personalized daily calorie goal and nutrient targets to track against."
            : "Your details drive the calorie ring and nutrition targets across the app. Update them anytime and Bite will recompute."
        }
      />

      {isOnboarding && (
        <div className="stub-note" style={{ marginBottom: 22 }}>
          <IconInfo />
          <div>
            <b>One quick step.</b> A single backend call (Claude, or a Mifflin–St Jeor
            formula fallback in stub mode) derives your calorie goal and personalized
            macro + micronutrient targets, then persists them.
          </div>
        </div>
      )}

      <div className="grid two-col">
        <ProfileForm
          profile={profile}
          onSaved={(p) => {
            setProfile(p);
            if (justArrived) navigate("/", { replace: true });
          }}
        />
        <div>
          {profile ? (
            <TargetsPanel profile={profile} />
          ) : (
            <div className="card card-pad" style={{ height: "100%" }}>
              <div
                className="state"
                style={{
                  padding: "40px 12px",
                  height: "100%",
                  justifyContent: "center",
                }}
              >
                <div className="state-icon">
                  <IconTarget />
                </div>
                <div className="state-title">Your targets appear here</div>
                <div className="state-msg">
                  Fill in the form and save to see your daily calorie goal, macro
                  split, and micronutrient targets.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: ProfileType | null;
  onSaved: (p: ProfileType) => void;
}) {
  const [form, setForm] = useState<FormState>(() => fromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSavedOk(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const age = Number(form.age);
    const height_cm = Number(form.height_cm);
    const weight_kg = Number(form.weight_kg);
    if (!age || !height_cm || !weight_kg) {
      setErr("Please enter your age, height, and weight.");
      return;
    }
    const input: ProfileInput = {
      age,
      sex: form.sex,
      height_cm,
      weight_kg,
      activity_level: form.activity_level,
      goal_type: form.goal_type,
      goal_rate: form.goal_rate,
    };
    setSaving(true);
    setErr(null);
    setSavedOk(false);
    try {
      const saved = await api.saveProfile(input);
      setSavedOk(true);
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card card-pad" onSubmit={onSubmit}>
      <div className="card-head">
        <div className="card-title">
          <IconUser width={16} height={16} style={{ verticalAlign: "-3px", marginRight: 8 }} />
          About you
        </div>
      </div>

      <div className="grid" style={{ gap: 18 }}>
        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="age">
              Age
            </label>
            <input
              id="age"
              className="input"
              type="number"
              min={13}
              max={100}
              value={form.age}
              onChange={(e) => set("age", e.target.value)}
              placeholder="29"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="sex">
              Sex
            </label>
            <select
              id="sex"
              className="select"
              value={form.sex}
              onChange={(e) => set("sex", e.target.value as Sex)}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="height">
              Height <span className="opt">· cm</span>
            </label>
            <input
              id="height"
              className="input"
              type="number"
              min={100}
              max={250}
              value={form.height_cm}
              onChange={(e) => set("height_cm", e.target.value)}
              placeholder="178"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="weight">
              Weight <span className="opt">· kg</span>
            </label>
            <input
              id="weight"
              className="input"
              type="number"
              min={30}
              max={300}
              step="0.1"
              value={form.weight_kg}
              onChange={(e) => set("weight_kg", e.target.value)}
              placeholder="75"
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="activity">
            Activity level
          </label>
          <select
            id="activity"
            className="select"
            value={form.activity_level}
            onChange={(e) => set("activity_level", e.target.value as ActivityLevel)}
          >
            {ACTIVITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="goal">
              Goal
            </label>
            <select
              id="goal"
              className="select"
              value={form.goal_type}
              onChange={(e) => set("goal_type", e.target.value as GoalType)}
            >
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="rate">
              Weekly rate
              {form.goal_type === "maintain" && <span className="opt"> · n/a</span>}
            </label>
            <select
              id="rate"
              className="select"
              value={form.goal_rate}
              disabled={form.goal_type === "maintain"}
              onChange={(e) => set("goal_rate", e.target.value)}
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r.replace("kg/week", " kg / week")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {err && (
          <div className="stub-note" style={{ background: "rgba(230,103,103,0.12)", borderColor: "rgba(230,103,103,0.3)", color: "#ffd0d0" }}>
            <IconInfo />
            <div>{err}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {savedOk ? <IconCheck /> : <IconTarget />}
            {saving
              ? "Computing…"
              : profile
                ? "Update & recompute"
                : "Compute my targets"}
          </button>
          {savedOk && (
            <span className="card-hint" style={{ color: "var(--good)" }}>
              Saved.
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

function TargetsPanel({ profile }: { profile: ProfileType }) {
  const targets: { label: string; value: number; unit: string; digits?: number }[] = [
    { label: "Protein", value: profile.protein_target_g, unit: "g", digits: 0 },
    { label: "Carbs", value: profile.carb_target_g, unit: "g" },
    { label: "Fat", value: profile.fat_target_g, unit: "g" },
    { label: "Fiber", value: profile.fiber_target_g, unit: "g", digits: 1 },
    { label: "Sugar limit", value: profile.sugar_limit_g, unit: "g", digits: 1 },
    { label: "Sodium limit", value: profile.sodium_limit_mg, unit: "mg" },
    { label: "Sat. fat limit", value: profile.satfat_limit_g, unit: "g", digits: 1 },
    { label: "Iron", value: profile.iron_target_mg, unit: "mg", digits: 1 },
    { label: "Calcium", value: profile.calcium_target_mg, unit: "mg" },
    { label: "Potassium", value: profile.potassium_target_mg, unit: "mg" },
  ];

  return (
    <div className="grid" style={{ gap: 20 }}>
      <section className="card card-pad">
        <div className="card-head">
          <div className="card-title">Daily calorie goal</div>
          <span className={`badge badge-${profile.target_source === "llm" ? "glasses" : "phone"}`}>
            {profile.target_source === "llm" ? "Claude" : "Formula"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div
            className="kpi-value"
            style={{ fontSize: 44, marginTop: 0, display: "inline-flex", alignItems: "baseline", gap: 4 }}
          >
            <IconFlame width={26} height={26} style={{ color: "var(--brand)", alignSelf: "center" }} />
            {formatNumber(profile.daily_calorie_target)}
            <span className="kpi-unit">kcal</span>
          </div>
        </div>
        <div className="card-hint" style={{ marginTop: 6 }}>
          TDEE estimate ~{formatNumber(profile.tdee_estimate)} kcal ·{" "}
          {titleCase(profile.goal_type)}
          {profile.goal_type !== "maintain" ? ` @ ${profile.goal_rate}` : ""}
        </div>
      </section>

      <section className="card card-pad">
        <div className="card-title" style={{ marginBottom: 14 }}>
          Nutrient targets
        </div>
        <div className="target-grid">
          {targets.map((t) => (
            <div className="target-cell" key={t.label}>
              <div className="target-val">
                {formatNumber(t.value, t.digits ?? 0)}
                <span className="target-unit"> {t.unit}</span>
              </div>
              <div className="target-lbl">{t.label}</div>
            </div>
          ))}
        </div>
      </section>

      {profile.rationale && (
        <div className="stub-note">
          <IconInfo />
          <div>
            <b>How this was derived.</b> {profile.rationale}
          </div>
        </div>
      )}
    </div>
  );
}
