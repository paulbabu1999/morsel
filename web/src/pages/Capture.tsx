import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api";
import type {
  CaptureDraft,
  CaptureSource,
  Meal,
  MealCreate,
  MealType,
} from "../api";
import { formatNumber, titleCase } from "../lib/format";
import { PageHead } from "../components/ui";
import { ErrorState } from "../components/states";
import { SourceBadge } from "../components/badges";
import {
  IconCamera,
  IconCheck,
  IconImage,
  IconInfo,
  IconPlus,
  IconSpark,
  IconTrash,
} from "../components/icons";

const SOURCES: CaptureSource[] = ["phone", "glasses", "manual"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** One editable draft line. */
interface EditItem {
  key: string;
  name: string;
  quantity: string;
  unit: string;
}

let keySeq = 0;
const nextKey = () => `row-${keySeq++}`;

export function Capture() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<CaptureSource>("phone");
  const [mealType, setMealType] = useState<MealType | "">("");
  const [location, setLocation] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [saved, setSaved] = useState<Meal | null>(null);
  // Two distinct pickers: the camera (capture="environment" opens the rear
  // camera on phones) and the photo library (a plain file input).
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function onPickPhoto(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onAnalyze(e: FormEvent) {
    e.preventDefault();
    setAnalyzing(true);
    setError(null);
    setDraft(null);
    setSaved(null);
    try {
      const d = await api.analyzeCapture({
        photo,
        note: note.trim() || undefined,
        meal_type: mealType || undefined,
        location: location.trim() || undefined,
        source,
      });
      setDraft(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  function reset() {
    onPickPhoto(null);
    setNote("");
    setMealType("");
    setLocation("");
    setSource("phone");
    setDraft(null);
    setSaved(null);
    setError(null);
  }

  return (
    <>
      <PageHead
        eyebrow="Log"
        title="Capture a meal"
        subtitle="Snap a photo and describe what you ate. Bite analyzes it into an editable draft — tweak the items, then confirm to save with full nutrition."
      />

      <div className="stub-note" style={{ marginBottom: 22 }}>
        <IconInfo />
        <div>
          <b>Two-step capture.</b> Your photo + note are analyzed into an editable draft,
          then each item is resolved to real USDA nutrition. Extraction uses vision
          structured-outputs when an LLM provider is configured, and a keyword matcher
          otherwise — the badge on each draft shows which ran. Edit anything before saving.
        </div>
      </div>

      <div className="grid two-col">
        {/* Step 1 — capture form */}
        <form className="card card-pad" onSubmit={onAnalyze}>
          <div className="grid" style={{ gap: 18 }}>
            <div className="field">
              <span className="label">
                Photo <span className="opt">· optional</span>
              </span>

              {/* Hidden inputs. The camera one requests the rear camera on
                  phones; the library one is a plain image picker. */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />

              {preview ? (
                <div className="photo-picked">
                  <div className="dropzone-preview">
                    <img src={preview} alt="Selected meal" />
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>
                        {photo?.name}
                      </div>
                      <div className="card-hint">Retake or choose another below</div>
                    </div>
                  </div>
                  <div className="photo-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => cameraRef.current?.click()}
                    >
                      <IconCamera width={16} height={16} />
                      Retake
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => libraryRef.current?.click()}
                    >
                      <IconImage width={16} height={16} />
                      Choose another
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onPickPhoto(null)}
                    >
                      <IconTrash width={16} height={16} />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="photo-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <IconCamera width={17} height={17} />
                    Take photo
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => libraryRef.current?.click()}
                  >
                    <IconImage width={17} height={17} />
                    Choose from library
                  </button>
                </div>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="note">
                Note <span className="opt">· what did you eat?</span>
              </label>
              <textarea
                id="note"
                className="textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="grabbed a burrito and an iced coffee at Chipotle"
              />
            </div>

            <div className="form-row">
              <div className="field">
                <label className="label" htmlFor="source">
                  Source
                </label>
                <select
                  id="source"
                  className="select"
                  value={source}
                  onChange={(e) => setSource(e.target.value as CaptureSource)}
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="mealType">
                  Meal type <span className="opt">· auto</span>
                </label>
                <select
                  id="mealType"
                  className="select"
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType | "")}
                >
                  <option value="">Infer from time</option>
                  {MEAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="location">
                Location <span className="opt">· auto from note</span>
              </label>
              <input
                id="location"
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Chipotle, Home, the office…"
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={analyzing}>
                <IconSpark />
                {analyzing ? "Analyzing…" : "Analyze"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={reset}
                disabled={analyzing}
              >
                Reset
              </button>
            </div>
          </div>
        </form>

        {/* Step 2 — editable draft / saved result */}
        <div>
          {error && <ErrorState message={error} />}
          {!error && saved && (
            <SavedMeal meal={saved} onLogAnother={reset} />
          )}
          {!error && !saved && draft && (
            <DraftEditor
              draft={draft}
              source={source}
              onSaved={setSaved}
            />
          )}
          {!error && !saved && !draft && (
            <div className="card card-pad" style={{ height: "100%" }}>
              <div
                className="state"
                style={{ padding: "40px 12px", height: "100%", justifyContent: "center" }}
              >
                <div className="state-icon">
                  <IconSpark />
                </div>
                <div className="state-title">Your editable draft appears here</div>
                <div className="state-msg">
                  Add a note (and optionally a photo), then hit “Analyze”. You'll get a
                  resolved item list you can edit before saving.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Draft editor (step 2) ---------------- */
function DraftEditor({
  draft,
  source,
  onSaved,
}: {
  draft: CaptureDraft;
  source: CaptureSource;
  onSaved: (m: Meal) => void;
}) {
  const [items, setItems] = useState<EditItem[]>(() =>
    draft.items.map((it) => ({
      key: nextKey(),
      name: it.canonical_name,
      quantity: String(it.quantity),
      unit: it.unit ?? "",
    })),
  );
  const [mealType, setMealType] = useState<MealType>(draft.meal_type);
  const [location, setLocation] = useState(draft.location ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updateItem(key: string, patch: Partial<EditItem>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeItem(key: string) {
    setItems((rows) => rows.filter((r) => r.key !== key));
  }
  function addItem() {
    setItems((rows) => [...rows, { key: nextKey(), name: "", quantity: "1", unit: "" }]);
  }

  async function save() {
    const cleaned = items
      .map((r) => {
        const q = Number(r.quantity);
        return {
          name: r.name.trim(),
          quantity: q > 0 ? q : 1, // reject 0 / negative / NaN
          unit: r.unit.trim() || null,
        };
      })
      .filter((r) => r.name);
    if (cleaned.length === 0) {
      setErr("Add at least one item before saving.");
      return;
    }
    const body: MealCreate = {
      meal_type: mealType,
      items: cleaned,
      location: location.trim() || null,
      note: draft.note ?? null,
      source,
      photo_uri: draft.photo_uri,
      description: null, // re-derived server-side from the edited items
      tags: [],
    };
    setSaving(true);
    setErr(null);
    try {
      const meal = await api.createMeal(body);
      onSaved(meal);
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
            Draft · not saved yet
          </div>
          <div className="card-title" style={{ fontSize: 17 }}>
            Review &amp; edit items
          </div>
        </div>
        <SourceBadge source={source} />
      </div>

      {/* Estimated totals from analysis */}
      <div className="draft-totals">
        <Estimate label="Calories" value={formatNumber(draft.total_calories)} unit="kcal" />
        <Estimate label="Protein" value={formatNumber(draft.total_protein_g, 1)} unit="g" />
        <Estimate label="Carbs" value={formatNumber(draft.total_carbs_g, 1)} unit="g" />
        <Estimate label="Fat" value={formatNumber(draft.total_fat_g, 1)} unit="g" />
      </div>
      <div className="card-hint" style={{ marginBottom: 16 }}>
        Estimated from analysis — nutrition is recomputed from your edits on save.
      </div>

      {/* Meal meta */}
      <div className="form-row" style={{ marginBottom: 16 }}>
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
          <label className="label">Location</label>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Home, Chipotle…"
          />
        </div>
      </div>

      {/* Editable items */}
      <div className="item-editor">
        <div className="item-editor-head">
          <span>Item</span>
          <span>Qty</span>
          <span>Unit</span>
          <span />
        </div>
        {items.map((it) => (
          <div className="item-row" key={it.key}>
            <input
              className="input"
              value={it.name}
              onChange={(e) => updateItem(it.key, { name: e.target.value })}
              placeholder="e.g. chicken burrito"
              aria-label="Item name"
            />
            <input
              className="input"
              type="number"
              min={0}
              step="0.25"
              value={it.quantity}
              onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
              aria-label="Quantity"
            />
            <input
              className="input"
              value={it.unit}
              onChange={(e) => updateItem(it.key, { unit: e.target.value })}
              placeholder="unit"
              aria-label="Unit"
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => removeItem(it.key)}
              aria-label="Remove item"
              title="Remove item"
            >
              <IconTrash width={16} height={16} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost add-item" onClick={addItem}>
          <IconPlus width={16} height={16} />
          Add item
        </button>
      </div>

      {draft.tags.length > 0 && (
        <div className="tags" style={{ marginTop: 16 }}>
          {draft.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="stub-note" style={{ marginTop: 18 }}>
        <IconInfo />
        <div>
          <b>{draft.extractor}</b>
          <br />
          {draft.extraction_note}
        </div>
      </div>

      {err && (
        <div
          className="stub-note"
          style={{
            marginTop: 12,
            background: "rgba(230,103,103,0.12)",
            borderColor: "rgba(230,103,103,0.3)",
            color: "#ffd0d0",
          }}
        >
          <IconInfo />
          <div>{err}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <IconCheck />
          {saving ? "Saving…" : "Confirm & save meal"}
        </button>
      </div>
    </div>
  );
}

function Estimate({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="estimate">
      <div className="estimate-val">
        {value}
        <span className="estimate-unit"> {unit}</span>
      </div>
      <div className="estimate-lbl">{label}</div>
    </div>
  );
}

/* ---------------- Saved meal (step 3) ---------------- */
function SavedMeal({ meal, onLogAnother }: { meal: Meal; onLogAnother: () => void }) {
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, color: "var(--good)" }}>
            Saved · {titleCase(meal.meal_type)}
          </div>
          <div className="card-title" style={{ fontSize: 17 }}>
            {meal.description}
          </div>
        </div>
        <SourceBadge source={meal.source} />
      </div>

      {meal.photo_uri && (
        <img
          src={meal.photo_uri}
          alt={meal.description}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            objectFit: "cover",
            borderRadius: "var(--r)",
            marginBottom: 16,
          }}
        />
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
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
                  <div className="food-raw">
                    {formatNumber(it.quantity, 2)} {it.unit ?? ""}
                  </div>
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
              <td className="num">{formatNumber(meal.total_calories)}</td>
              <td className="num">{formatNumber(meal.total_protein_g, 1)}</td>
              <td className="num">{formatNumber(meal.total_carbs_g, 1)}</td>
              <td className="num">{formatNumber(meal.total_fat_g, 1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="micro-strip">
        <MicroPill label="Fiber" value={`${formatNumber(meal.total_fiber_g, 1)} g`} />
        <MicroPill label="Sugar" value={`${formatNumber(meal.total_sugar_g, 1)} g`} />
        <MicroPill label="Sodium" value={`${formatNumber(meal.total_sodium_mg)} mg`} />
        <MicroPill label="Sat fat" value={`${formatNumber(meal.total_satfat_g, 1)} g`} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Link className="btn btn-ghost" to={`/meals/${meal.id}`}>
          View full detail
        </Link>
        <Link className="btn btn-ghost" to="/history">
          See history
        </Link>
        <button className="btn btn-ghost" onClick={onLogAnother}>
          Log another
        </button>
      </div>
    </div>
  );
}

function MicroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="micro-pill">
      <span className="micro-pill-lbl">{label}</span>
      <span className="micro-pill-val">{value}</span>
    </div>
  );
}
