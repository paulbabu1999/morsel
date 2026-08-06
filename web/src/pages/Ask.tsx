import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { api } from "../api";
import type { QueryResponse, QueryRoute } from "../api";
import { ApiError } from "../api";
import { useAsync } from "../lib/useAsync";
import { formatDataValue, humanizeKey } from "../lib/format";
import { PageHead } from "../components/ui";
import { ErrorState, Loading } from "../components/states";
import { RouteBadge, ROUTE_META } from "../components/badges";
import { MealCardCompact } from "../components/MealCard";
import { IconAggregate, IconInfo, IconSearch, IconSend } from "../components/icons";

const ROUTES: QueryRoute[] = ["aggregate", "semantic", "hybrid"];

function routeVars(route: QueryRoute): CSSProperties {
  return {
    ["--rb-color" as string]: `var(--route-${route})`,
    ["--rb-soft" as string]: `var(--route-${route}-soft)`,
  };
}

export function Ask() {
  const examples = useAsync(() => api.queryExamples(), []);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.query(trimmed);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(question);
  }

  function onChip(q: string) {
    setQuestion(q);
    run(q);
  }

  return (
    <>
      <PageHead
        eyebrow="Agentic memory"
        title="Ask your food memory"
        subtitle="Ask in plain English. A router classifies each question and picks a retrieval path — watch the route badge to see whether it aggregated the numbers, searched by meaning, or did both."
      />

      <div className="ask-hero">
        <form className="ask-form" onSubmit={onSubmit}>
          <div className="search">
            <IconSearch />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. How much protein did I eat this week?"
              aria-label="Your question"
              autoFocus
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !question.trim()}>
            <IconSend />
            {loading ? "Asking…" : "Ask"}
          </button>
        </form>

        {examples.data && examples.data.length > 0 && (
          <div className="chips">
            {examples.data.map((ex) => (
              <button key={ex} className="chip" onClick={() => onChip(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Route legend — tells the "which retrieval path" story up-front. */}
        <div className="route-legend">
          {ROUTES.map((r) => (
            <div className="route-legend-item" key={r} style={routeVars(r)}>
              <span className="rl-dot" style={{ background: `var(--route-${r})` }} />
              <div>
                <div className="rl-name" style={{ color: `var(--route-${r})` }}>
                  {ROUTE_META[r].label}
                </div>
                <div className="rl-desc">{ROUTE_META[r].engine}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-gap">
        {loading && <Loading label="Routing your question…" />}
        {error && <ErrorState message={error} onRetry={() => run(question)} />}
        {result && !loading && <Answer result={result} />}
      </div>
    </>
  );
}

function Answer({ result }: { result: QueryResponse }) {
  const meta = ROUTE_META[result.route];
  const dataEntries = Object.entries(result.data ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  );

  return (
    <div className="answer-card" style={routeVars(result.route)}>
      <div className="answer-top">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <RouteBadge route={result.route} size="lg" />
          <span className="card-hint" style={{ maxWidth: "40ch", textAlign: "right" }}>
            {meta.blurb}
          </span>
        </div>

        <div className="answer-q">You asked: “{result.question}”</div>
        <div className="answer-text">{result.answer}</div>

        <div className="router-note">
          <IconInfo />
          <div>
            <b>Router decision.</b> {result.router_note}
          </div>
        </div>
      </div>

      {dataEntries.length > 0 && (
        <div className="data-facts">
          {dataEntries.map(([k, v]) => (
            <div className="fact" key={k}>
              <div className="fact-label">{humanizeKey(k)}</div>
              <div className="fact-value">{formatDataValue(v)}</div>
            </div>
          ))}
        </div>
      )}

      {result.sql && (
        <details className="sql-block">
          <summary>
            <IconAggregate width={15} height={15} />
            Show the executed SQL
          </summary>
          <pre>
            <code>{result.sql}</code>
          </pre>
        </details>
      )}

      {result.meals.length > 0 && (
        <div className="answer-cites">
          <div className="cites-title">
            {result.meals.length} cited meal{result.meals.length === 1 ? "" : "s"}
          </div>
          <div className="cites-grid">
            {result.meals.map((m) => (
              <MealCardCompact key={m.id} meal={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
