import { useEffect, useState } from "react";
import { api } from "../api";
import type { Meal, MealType } from "../api";
import { useAsync } from "../lib/useAsync";
import { PageHead } from "../components/ui";
import { ErrorState, EmptyState, SkeletonGrid } from "../components/states";
import { MealCard } from "../components/MealCard";
import { IconHistory, IconSearch } from "../components/icons";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function History() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [mealType, setMealType] = useState<MealType | "">("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Debounce the free-text search so we don't fetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const { data, loading, error, reload } = useAsync<Meal[]>(
    () =>
      api.listMeals({
        q: q || undefined,
        meal_type: mealType || undefined,
        start: start ? `${start}T00:00:00` : undefined,
        end: end ? `${end}T23:59:59` : undefined,
      }),
    [q, mealType, start, end],
  );

  const hasFilters = q || mealType || start || end;
  const clear = () => {
    setQInput("");
    setQ("");
    setMealType("");
    setStart("");
    setEnd("");
  };

  return (
    <>
      <PageHead
        eyebrow="Timeline"
        title="History"
        subtitle="Every logged meal, newest first. Filter by type, date, or search across dishes, tags and places."
      />

      <div className="filter-bar">
        <div className="search">
          <IconSearch />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search dishes, tags, or locations…"
            aria-label="Search meals"
          />
        </div>
        <div className="field">
          <select
            className="select"
            value={mealType}
            onChange={(e) => setMealType(e.target.value as MealType | "")}
            aria-label="Meal type"
          >
            <option value="">All meal types</option>
            {MEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <input
            type="date"
            className="input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="From date"
          />
        </div>
        <div className="field">
          <input
            type="date"
            className="input"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="To date"
          />
        </div>
        {hasFilters && (
          <button className="btn btn-ghost" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {loading && <SkeletonGrid count={6} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={<IconHistory />}
          title="No meals found"
          message={
            hasFilters
              ? "Try loosening your filters."
              : "Log a meal from the Capture screen to see it here."
          }
        />
      )}
      {data && data.length > 0 && (
        <>
          <div className="card-hint" style={{ marginBottom: 14 }}>
            {data.length} meal{data.length === 1 ? "" : "s"}
          </div>
          <div className="meal-grid">
            {data.map((m) => (
              <MealCard key={m.id} meal={m} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
