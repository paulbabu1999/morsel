import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAsync } from "../lib/useAsync";
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatTime,
  titleCase,
} from "../lib/format";
import { ErrorState, Loading } from "../components/states";
import { SourceBadge } from "../components/badges";
import { IconArrowLeft, IconImage } from "../components/icons";

export function MealDetail() {
  const { id = "" } = useParams();
  const { data: meal, loading, error, reload } = useAsync(
    () => api.getMeal(id),
    [id],
  );

  return (
    <>
      <Link to="/history" className="back-link">
        <IconArrowLeft />
        Back to history
      </Link>

      {loading && <Loading label="Loading meal…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {meal && (
        <>
          <header className="page-head">
            <div>
              <div className="eyebrow">{titleCase(meal.meal_type)}</div>
              <h1 className="page-title">{meal.description}</h1>
              <p className="page-subtitle">
                {formatDate(meal.eaten_at)} · {formatTime(meal.eaten_at)}
                {meal.location_text ? ` · ${meal.location_text}` : ""}
              </p>
            </div>
            <SourceBadge source={meal.source} />
          </header>

          <div className="detail-grid">
            {/* Left: photo + items table */}
            <div className="grid" style={{ gap: 20 }}>
              <div className={`detail-photo${meal.photo_uri ? "" : " noimg"}`}>
                {meal.photo_uri ? (
                  <img src={meal.photo_uri} alt={meal.description} />
                ) : (
                  <IconImage width={40} height={40} />
                )}
              </div>

              <section className="card card-pad">
                <div className="card-head">
                  <div className="card-title">Items</div>
                  <div className="card-hint">{meal.items.length} logged</div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th className="num">Qty</th>
                        <th className="num">Cal</th>
                        <th className="num">P</th>
                        <th className="num">C</th>
                        <th className="num">F</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meal.items.map((it) => (
                        <tr key={it.id}>
                          <td>
                            <div className="food-name">{it.canonical_name}</div>
                            {it.raw_name && it.raw_name !== it.canonical_name && (
                              <div className="food-raw">“{it.raw_name}”</div>
                            )}
                          </td>
                          <td className="num">
                            {formatNumber(it.quantity, 2)} {it.unit ?? ""}
                          </td>
                          <td className="num">{formatNumber(it.calories)}</td>
                          <td className="num">{formatNumber(it.protein_g, 1)}</td>
                          <td className="num">{formatNumber(it.carbs_g, 1)}</td>
                          <td className="num">{formatNumber(it.fat_g, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        <td className="num"></td>
                        <td className="num">{formatNumber(meal.total_calories)}</td>
                        <td className="num">{formatNumber(meal.total_protein_g, 1)}</td>
                        <td className="num">{formatNumber(meal.total_carbs_g, 1)}</td>
                        <td className="num">{formatNumber(meal.total_fat_g, 1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </div>

            {/* Right: macros + metadata + tags */}
            <div className="grid" style={{ gap: 20 }}>
              <section className="card card-pad">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  Nutrition
                </div>
                <div className="kpi-grid" style={{ margin: 0, gap: 12 }}>
                  <Macro label="Calories" value={formatNumber(meal.total_calories)} unit="kcal" />
                  <Macro label="Protein" value={formatNumber(meal.total_protein_g, 1)} unit="g" />
                  <Macro label="Carbs" value={formatNumber(meal.total_carbs_g, 1)} unit="g" />
                  <Macro label="Fat" value={formatNumber(meal.total_fat_g, 1)} unit="g" />
                </div>
                <div className="micro-grid" style={{ marginTop: 14 }}>
                  <MicroRow k="Fiber" v={`${formatNumber(meal.total_fiber_g, 1)} g`} />
                  <MicroRow k="Sugar" v={`${formatNumber(meal.total_sugar_g, 1)} g`} />
                  <MicroRow k="Sodium" v={`${formatNumber(meal.total_sodium_mg)} mg`} />
                  <MicroRow k="Saturated fat" v={`${formatNumber(meal.total_satfat_g, 1)} g`} />
                  <MicroRow k="Iron" v={`${formatNumber(meal.total_iron_mg, 1)} mg`} />
                  <MicroRow k="Calcium" v={`${formatNumber(meal.total_calcium_mg)} mg`} />
                  <MicroRow k="Potassium" v={`${formatNumber(meal.total_potassium_mg)} mg`} />
                </div>
              </section>

              <section className="card card-pad">
                <div className="card-title" style={{ marginBottom: 8 }}>
                  Details
                </div>
                <div className="meta-list">
                  <MetaRow k="Meal type" v={titleCase(meal.meal_type)} />
                  <MetaRow k="Eaten" v={`${formatDate(meal.eaten_at)}, ${formatTime(meal.eaten_at)}`} />
                  <MetaRow k="Location" v={meal.location_text ?? "—"} />
                  <MetaRow k="Source" v={<SourceBadge source={meal.source} />} />
                  <MetaRow
                    k="Confidence"
                    v={
                      <>
                        <span className="confidence-bar">
                          <span
                            className="confidence-fill"
                            style={{ width: `${Math.round(meal.confidence * 100)}%` }}
                          />
                        </span>
                        {formatPercent(meal.confidence)}
                      </>
                    }
                  />
                  {meal.note_text && <MetaRow k="Note" v={meal.note_text} />}
                  <MetaRow k="Meal ID" v={<code>{meal.id}</code>} />
                </div>
              </section>

              {meal.tags.length > 0 && (
                <section className="card card-pad">
                  <div className="card-title" style={{ marginBottom: 14 }}>
                    Tags
                  </div>
                  <div className="tags">
                    {meal.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Macro({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="kpi" style={{ padding: "14px 16px" }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 24, marginTop: 8 }}>
        {value}
        <span className="kpi-unit">{unit}</span>
      </div>
    </div>
  );
}

function MicroRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="micro-item">
      <span className="micro-item-key">{k}</span>
      <span className="micro-item-val">{v}</span>
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="meta-item">
      <span className="meta-key">{k}</span>
      <span className="meta-val">{v}</span>
    </div>
  );
}
