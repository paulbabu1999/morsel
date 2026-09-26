import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { CaptureDraft, Meal, MealCreate, MealItem, MealType } from "../api";
import { ApiError } from "../api";
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
import { ShareMeal } from "../components/ShareMeal";
import { PhotoGallery } from "../components/PhotoGallery";
import { PortionTips } from "../components/nutrition";
import {
  IconArrowLeft,
  IconCheck,
  IconImage,
  IconInfo,
  IconPencil,
  IconPlus,
  IconSpark,
  IconTrash,
} from "../components/icons";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/* One editable item row. `grams`/`calories` are carried anchors: kept across
 * edits (so the backend keeps the resolved density) and nulled on a name change
 * to force a fresh re-resolve — same contract as the capture draft editor. */
interface EditItem {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  grams: number | null;
  calories: number | null;
}

let keySeq = 0;
const nextKey = () => `edit-${keySeq++}`;

function itemsToEdit(items: MealItem[]): EditItem[] {
  return items.map((it) => ({
    key: nextKey(),
    name: it.canonical_name,
    quantity: String(it.quantity),
    unit: it.unit ?? "",
    grams: it.grams,
    calories: it.calories,
  }));
}

/** Format a Date as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MealDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: meal, loading, error, reload } = useAsync(
    () => api.getMeal(id),
    [id],
  );

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  // Optimistic copy so a save reflects instantly without a round-trip reload.
  const [edited, setEdited] = useState<Meal | null>(null);
  const view = edited ?? meal;

  async function doDelete() {
    if (!view || deleting) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      await api.deleteMeal(view.id);
      navigate("/history");
    } catch (e) {
      setDeleteErr(e instanceof ApiError ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <>
      <Link to="/history" className="back-link">
        <IconArrowLeft />
        Back to history
      </Link>

      {loading && <Loading label="Loading meal…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {view && (
        <>
          <header className="page-head">
            <div>
              <div className="eyebrow">{titleCase(view.meal_type)}</div>
              <h1 className="page-title">{view.description}</h1>
              <p className="page-subtitle">
                {formatDate(view.eaten_at)} · {formatTime(view.eaten_at)}
                {view.location_text ? ` · ${view.location_text}` : ""}
              </p>
            </div>
            {!editing && (
              <div className="detail-actions">
                <SourceBadge source={view.source} />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditing(true)}
                >
                  <IconPencil width={15} height={15} />
                  Edit
                </button>
                <ShareMeal mealId={view.id} />
                <button
                  type="button"
                  className="btn btn-danger-soft btn-sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash width={15} height={15} />
                  Delete
                </button>
              </div>
            )}
          </header>

          {confirmDelete && !editing && (
            <div className="delete-confirm">
              <div>
                <b>Delete this meal?</b>
                <div className="delete-confirm-sub">
                  This permanently removes it from your history. This can’t be undone.
                </div>
                {deleteErr && <div className="delete-confirm-err">{deleteErr}</div>}
              </div>
              <div className="delete-confirm-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={doDelete}
                  disabled={deleting}
                >
                  <IconTrash width={15} height={15} />
                  {deleting ? "Deleting…" : "Delete meal"}
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <MealEditor
              meal={view}
              onSaved={(m) => {
                setEdited(m);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="detail-grid">
              {/* Left: photo + items table */}
              <div className="grid" style={{ gap: 20 }}>
                {(() => {
                  const photos = view.photo_uris?.length
                    ? view.photo_uris
                    : view.photo_uri
                      ? [view.photo_uri]
                      : [];
                  if (photos.length > 1)
                    return <PhotoGallery photos={photos} alt={view.description} />;
                  return (
                    <div className={`detail-photo${photos[0] ? "" : " noimg"}`}>
                      {photos[0] ? (
                        <img src={photos[0]} alt={view.description} />
                      ) : (
                        <IconImage width={40} height={40} />
                      )}
                    </div>
                  );
                })()}

                <section className="card card-pad">
                  <div className="card-head">
                    <div className="card-title">Items</div>
                    <div className="card-hint">{view.items.length} logged</div>
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
                        {view.items.map((it) => (
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
                          <td className="num">{formatNumber(view.total_calories)}</td>
                          <td className="num">{formatNumber(view.total_protein_g, 1)}</td>
                          <td className="num">{formatNumber(view.total_carbs_g, 1)}</td>
                          <td className="num">{formatNumber(view.total_fat_g, 1)}</td>
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
                    <Macro label="Protein" value={formatNumber(view.total_protein_g, 1)} unit="g" hero />
                    <Macro label="Calories" value={formatNumber(view.total_calories)} unit="kcal" />
                    <Macro label="Carbs" value={formatNumber(view.total_carbs_g, 1)} unit="g" />
                    <Macro label="Fat" value={formatNumber(view.total_fat_g, 1)} unit="g" />
                  </div>
                  <div className="micro-grid" style={{ marginTop: 14 }}>
                    <MicroRow k="Fiber" v={`${formatNumber(view.total_fiber_g, 1)} g`} />
                    <MicroRow k="Sugar" v={`${formatNumber(view.total_sugar_g, 1)} g`} />
                    <MicroRow k="Sodium" v={`${formatNumber(view.total_sodium_mg)} mg`} />
                    <MicroRow k="Saturated fat" v={`${formatNumber(view.total_satfat_g, 1)} g`} />
                    <MicroRow k="Iron" v={`${formatNumber(view.total_iron_mg, 1)} mg`} />
                    <MicroRow k="Calcium" v={`${formatNumber(view.total_calcium_mg)} mg`} />
                    <MicroRow k="Potassium" v={`${formatNumber(view.total_potassium_mg)} mg`} />
                  </div>
                </section>

                <section className="card card-pad">
                  <div className="card-title" style={{ marginBottom: 8 }}>
                    Details
                  </div>
                  <div className="meta-list">
                    <MetaRow k="Meal type" v={titleCase(view.meal_type)} />
                    <MetaRow k="Eaten" v={`${formatDate(view.eaten_at)}, ${formatTime(view.eaten_at)}`} />
                    <MetaRow k="Location" v={view.location_text ?? "—"} />
                    <MetaRow k="Source" v={<SourceBadge source={view.source} />} />
                    <MetaRow
                      k="Confidence"
                      v={
                        <>
                          <span className="confidence-bar">
                            <span
                              className="confidence-fill"
                              style={{ width: `${Math.round(view.confidence * 100)}%` }}
                            />
                          </span>
                          {formatPercent(view.confidence)}
                        </>
                      }
                    />
                    {view.note_text && <MetaRow k="Note" v={view.note_text} />}
                    <MetaRow k="Meal ID" v={<code>{view.id}</code>} />
                  </div>
                </section>

                {view.tags.length > 0 && (
                  <section className="card card-pad">
                    <div className="card-title" style={{ marginBottom: 14 }}>
                      Tags
                    </div>
                    <div className="tags">
                      {view.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Edit mode — mirrors the capture draft editor (item cards + "Fix it"
 * refine + details), but saves via PUT /meals/{id} instead of creating.
 * ------------------------------------------------------------------ */
function MealEditor({
  meal,
  onSaved,
  onCancel,
}: {
  meal: Meal;
  onSaved: (m: Meal) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<EditItem[]>(() => itemsToEdit(meal.items));
  const [mealType, setMealType] = useState<MealType>(meal.meal_type);
  const [location, setLocation] = useState(meal.location_text ?? "");
  const [note, setNote] = useState(meal.note_text ?? "");
  const [eatenAt, setEatenAt] = useState(() => toLocalInputValue(new Date(meal.eaten_at)));
  const [totals, setTotals] = useState({
    calories: meal.total_calories,
    protein: meal.total_protein_g,
    carbs: meal.total_carbs_g,
    fat: meal.total_fat_g,
  });
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updateItem(key: string, patch: Partial<EditItem>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function changeName(key: string, name: string) {
    // A new name invalidates the carried anchors — null them so the backend
    // re-resolves grams/calories from scratch.
    setItems((rows) =>
      rows.map((r) => (r.key === key ? { ...r, name, grams: null, calories: null } : r)),
    );
  }
  function changeQuantity(key: string, nextQty: string) {
    setItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const oldQ = Number(r.quantity);
        const newQ = Number(nextQty);
        // Scale anchors proportionally so per-unit density stays constant.
        const scalable =
          Number.isFinite(oldQ) && oldQ > 0 && Number.isFinite(newQ) && newQ > 0;
        const factor = scalable ? newQ / oldQ : 1;
        return {
          ...r,
          quantity: nextQty,
          grams: r.grams != null ? r.grams * factor : r.grams,
          calories: r.calories != null ? r.calories * factor : r.calories,
        };
      }),
    );
  }
  function removeItem(key: string) {
    setItems((rows) => rows.filter((r) => r.key !== key));
  }
  function addItem() {
    setItems((rows) => [
      ...rows,
      { key: nextKey(), name: "", quantity: "1", unit: "", grams: null, calories: null },
    ]);
  }

  function itemsPayload() {
    return items
      .map((r) => {
        const q = Number(r.quantity);
        return {
          name: r.name.trim(),
          quantity: q > 0 ? q : 1,
          unit: r.unit.trim() || null,
          grams: r.grams,
          calories: r.calories,
        };
      })
      .filter((r) => r.name);
  }

  function applyDraft(next: CaptureDraft) {
    setItems(itemsToEdit(next.items));
    setTotals({
      calories: next.total_calories,
      protein: next.total_protein_g,
      carbs: next.total_carbs_g,
      fat: next.total_fat_g,
    });
  }

  async function refine() {
    const text = correction.trim();
    if (!text || refining) return;
    setRefining(true);
    setErr(null);
    try {
      const next = await api.refineCapture({
        items: itemsPayload(),
        correction: text,
        meal_type: mealType,
        location: location.trim() || null,
        note: note.trim() || null,
        source: meal.source,
        photo_uris: meal.photo_uris,
      });
      applyDraft(next);
      setCorrection("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRefining(false);
    }
  }

  async function save() {
    const cleaned = itemsPayload();
    if (cleaned.length === 0) {
      setErr("Add at least one item before saving.");
      return;
    }
    const body: MealCreate = {
      meal_type: mealType,
      items: cleaned,
      location: location.trim() || null,
      note: note.trim() || null,
      source: meal.source,
      photo_uri: meal.photo_uri,
      photo_uris: meal.photo_uris,
      // Send the datetime-local value as-is (naive wall-clock). The app renders
      // naive meal times as local and the server default (now()) is naive too, so
      // converting to a UTC "Z" here would shift the stored time by the tz offset.
      eaten_at: eatenAt || null,
      description: null, // re-derived server-side from the edited items
      tags: meal.tags,
    };
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.updateMeal(meal.id, body);
      onSaved(updated);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="card-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Editing meal
          </div>
          <div className="card-title" style={{ fontSize: 17 }}>
            Adjust items &amp; details
          </div>
        </div>
        <SourceBadge source={meal.source} />
      </div>

      <div className="meal-totals">
        <div className="meal-totals-cal">
          <span className="meal-totals-num">{formatNumber(totals.calories)}</span>
          <span className="meal-totals-unit">kcal</span>
        </div>
        <div className="meal-totals-macros">
          <span className="mt-chip mt-p">{formatNumber(totals.protein, 1)}g protein</span>
          <span className="mt-chip mt-c">{formatNumber(totals.carbs, 1)}g carbs</span>
          <span className="mt-chip mt-f">{formatNumber(totals.fat, 1)}g fat</span>
        </div>
        <div className="meal-totals-hint">
          Totals recompute from your edits when you save.
        </div>
      </div>

      <div className="draft-items">
        {items.map((it) => (
          <div className="draft-item" key={it.key}>
            <div className="draft-item-top">
              <input
                className="input draft-item-name"
                value={it.name}
                onChange={(e) => changeName(it.key, e.target.value)}
                placeholder="e.g. chicken burrito"
                aria-label="Item name"
              />
              <button
                type="button"
                className="draft-item-del"
                onClick={() => removeItem(it.key)}
                aria-label="Remove item"
                title="Remove item"
              >
                <IconTrash width={15} height={15} />
              </button>
            </div>
            <div className="draft-item-fields">
              <label className="mini-field">
                <span>Qty</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.25"
                  value={it.quantity}
                  onChange={(e) => changeQuantity(it.key, e.target.value)}
                  aria-label="Quantity"
                />
              </label>
              <label className="mini-field">
                <span>Unit</span>
                <input
                  className="input"
                  value={it.unit}
                  onChange={(e) => updateItem(it.key, { unit: e.target.value })}
                  placeholder="serving"
                  aria-label="Unit"
                />
              </label>
              {it.calories != null && (
                <span className="draft-item-cal">{formatNumber(it.calories)} kcal</span>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost add-item" onClick={addItem}>
          <IconPlus width={16} height={16} />
          Add item
        </button>
      </div>

      <PortionTips />

      {/* Natural-language correction — re-estimates the whole meal in one shot. */}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              refine();
            }
          }}
          placeholder="Not right? e.g. 'the dal is cooked, ~200 cal' or 'only 2 rotis'"
          aria-label="Describe a correction"
          disabled={refining}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={refine}
          disabled={refining || !correction.trim()}
        >
          <IconSpark width={16} height={16} />
          {refining ? "Fixing…" : "Fix it"}
        </button>
      </div>

      <div className="draft-details">
        <div className="draft-details-label">Details</div>
        <div className="form-row">
          <div className="field">
            <label className="label">Meal type</label>
            <select
              className="select"
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
            >
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">When</label>
            <input
              className="input"
              type="datetime-local"
              value={eatenAt}
              max={toLocalInputValue(new Date())}
              onChange={(e) => setEatenAt(e.target.value)}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">
            Location <span className="opt">· optional</span>
          </label>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Home, Chipotle…"
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">
            Note <span className="opt">· optional</span>
          </label>
          <textarea
            className="textarea"
            style={{ minHeight: 58 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="anything to remember about this meal"
          />
        </div>
      </div>

      {err && (
        <div className="delete-confirm-err" style={{ marginTop: 14 }}>
          <IconInfo width={15} height={15} />
          <span>{err}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <IconCheck />
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Macro({
  label,
  value,
  unit,
  hero,
}: {
  label: string;
  value: string;
  unit: string;
  hero?: boolean;
}) {
  return (
    <div className={`kpi${hero ? " kpi-hero" : ""}`} style={{ padding: "14px 16px" }}>
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
