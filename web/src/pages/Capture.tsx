import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, warmup } from "../api";
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
import { PhotoGallery } from "../components/PhotoGallery";
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
  /**
   * Density anchors carried from the analyzed draft. They scale with quantity
   * edits and reset to null on a name change (forcing a fresh backend
   * re-resolve); both are forwarded on save + refine.
   */
  grams: number | null;
  calories: number | null;
}

let keySeq = 0;
const nextKey = () => `row-${keySeq++}`;

/** Map draft items to editable rows, seeding the grams/calories anchors. */
function toEditItems(draft: CaptureDraft): EditItem[] {
  return draft.items.map((it) => ({
    key: nextKey(),
    name: it.canonical_name,
    quantity: String(it.quantity),
    unit: it.unit ?? "",
    grams: it.grams,
    calories: it.calories,
  }));
}

/* ------------------------------------------------------------------ *
 * In-progress draft persistence
 *
 * The analyzed draft (and the surrounding form state) would otherwise be lost
 * when the user navigates away from /capture and back. We stash it in
 * localStorage — the draft already embeds photo_uris (data URLs), so photos
 * survive too — and clear it on a successful save or an explicit reset.
 * ------------------------------------------------------------------ */

const CAPTURE_DRAFT_KEY = "bite_capture_draft";

interface PersistedCapture {
  draft: CaptureDraft | null;
  note: string;
  mealType: MealType | "";
  location: string;
  source: CaptureSource;
  eatenAt: string;
}

function loadPersistedCapture(): PersistedCapture | null {
  try {
    const raw = localStorage.getItem(CAPTURE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCapture;
    // Guard against a malformed / stale-schema blob crashing hydration.
    if (parsed.draft && !Array.isArray(parsed.draft.items)) parsed.draft = null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedCapture(): void {
  try {
    localStorage.removeItem(CAPTURE_DRAFT_KEY);
  } catch {
    /* storage disabled — nothing to clear */
  }
}

/** Format a Date as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Capture() {
  // Rehydrate a draft-in-progress (if any) once, before seeding state below.
  const persisted = useMemo(() => loadPersistedCapture(), []);

  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [note, setNote] = useState(() => persisted?.note ?? "");
  const [source, setSource] = useState<CaptureSource>(() => persisted?.source ?? "phone");
  const [mealType, setMealType] = useState<MealType | "">(() => persisted?.mealType ?? "");
  const [location, setLocation] = useState(() => persisted?.location ?? "");
  const [eatenAt, setEatenAt] = useState<string>(
    () => persisted?.eatenAt ?? toLocalInputValue(new Date()),
  );

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaptureDraft | null>(() => persisted?.draft ?? null);
  const [saved, setSaved] = useState<Meal | null>(null);

  // Warm the (Render free-tier) backend the moment the user lands on Capture,
  // so a cold box is already spinning up before they hit Analyze.
  useEffect(() => {
    warmup();
  }, []);

  // Persist the in-progress draft + form state whenever it changes, so it
  // survives navigating away and back. Only write once there's a draft.
  useEffect(() => {
    if (!draft) return;
    try {
      localStorage.setItem(
        CAPTURE_DRAFT_KEY,
        JSON.stringify({ draft, note, mealType, location, source, eatenAt }),
      );
    } catch {
      /* storage disabled / over quota — the draft just won't persist */
    }
  }, [draft, note, mealType, location, source, eatenAt]);

  // A confirmed save is the end of this draft's life — drop the stashed copy.
  useEffect(() => {
    if (saved) clearPersistedCapture();
  }, [saved]);
  // Camera (capture="environment" = rear camera on phones) vs. library (plain,
  // multi-select) pickers; both append to the photo list.
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function addPhotos(list: FileList | null) {
    if (!list || list.length === 0) return;
    // A photo means Analyze is imminent — start waking a cold box now.
    warmup();
    const added = Array.from(list);
    setPhotos((p) => [...p, ...added]);
    setPreviews((pv) => [...pv, ...added.map((f) => URL.createObjectURL(f))]);
  }
  function removePhoto(i: number) {
    setPreviews((pv) => {
      URL.revokeObjectURL(pv[i]);
      return pv.filter((_, idx) => idx !== i);
    });
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }
  function clearPhotos() {
    setPreviews((pv) => {
      pv.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
    setPhotos([]);
  }

  async function onAnalyze(e: FormEvent) {
    e.preventDefault();
    setAnalyzing(true);
    setError(null);
    setDraft(null);
    setSaved(null);
    try {
      const d = await api.analyzeCapture({
        photos,
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
    clearPhotos();
    setNote("");
    setMealType("");
    setLocation("");
    setSource("phone");
    setEatenAt(toLocalInputValue(new Date()));
    setDraft(null);
    setSaved(null);
    setError(null);
    clearPersistedCapture();
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
          <b>Two-step capture.</b> Your photos + note are analyzed into an editable draft,
          then each item is resolved to real USDA nutrition. Cooking something like overnight
          oats? Add the finished dish <i>and</i> a few ingredient photos — it treats them as one
          meal and sums the parts. Edit anything before saving.
        </div>
      </div>

      <div className="grid two-col">
        {/* Step 1 — capture form */}
        <form className="card card-pad" onSubmit={onAnalyze}>
          <div className="grid" style={{ gap: 18 }}>
            <div className="field">
              <span className="label">
                Photos <span className="opt">· optional · the dish + any ingredients</span>
              </span>

              {/* Hidden inputs. The camera one requests the rear camera on phones
                  (one shot at a time); the library one allows multi-select. Both
                  append to the list. */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />

              {previews.length > 0 ? (
                <div className="photo-picked">
                  <div className="photo-thumbs">
                    {previews.map((src, i) => (
                      <div className="photo-thumb" key={src}>
                        <img src={src} alt={`Meal photo ${i + 1}`} />
                        <button
                          type="button"
                          className="photo-thumb-x"
                          onClick={() => removePhoto(i)}
                          aria-label={`Remove photo ${i + 1}`}
                          title="Remove"
                        >
                          <IconTrash width={14} height={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="photo-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => cameraRef.current?.click()}
                    >
                      <IconCamera width={16} height={16} />
                      Take photo
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => libraryRef.current?.click()}
                    >
                      <IconImage width={16} height={16} />
                      Add from library
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={clearPhotos}>
                      <IconTrash width={16} height={16} />
                      Clear
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

            <div className="field">
              <label className="label" htmlFor="eatenAt">
                When <span className="opt">· defaults to now — set it for an earlier meal</span>
              </label>
              <input
                id="eatenAt"
                className="input"
                type="datetime-local"
                value={eatenAt}
                max={toLocalInputValue(new Date())}
                onChange={(e) => setEatenAt(e.target.value)}
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
              eatenAt={eatenAt}
              onSaved={setSaved}
              onRefined={setDraft}
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
  draft: initialDraft,
  source,
  eatenAt,
  onSaved,
  onRefined,
}: {
  draft: CaptureDraft;
  source: CaptureSource;
  eatenAt: string;
  onSaved: (m: Meal) => void;
  /** Lift a refined draft up so the parent can re-render totals + persist it. */
  onRefined?: (d: CaptureDraft) => void;
}) {
  // The working draft: seeded from the prop, then replaced in place by a
  // natural-language refine. Totals/tags/notes below read from this copy.
  const [draft, setDraft] = useState<CaptureDraft>(initialDraft);
  const [items, setItems] = useState<EditItem[]>(() => toEditItems(initialDraft));
  const [mealType, setMealType] = useState<MealType>(initialDraft.meal_type);
  const [location, setLocation] = useState(initialDraft.location ?? "");
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [correction, setCorrection] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function updateItem(key: string, patch: Partial<EditItem>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function changeName(key: string, name: string) {
    // A new name invalidates the carried anchors — null them so the backend
    // re-resolves grams/calories from scratch.
    setItems((rows) =>
      rows.map((r) =>
        r.key === key ? { ...r, name, grams: null, calories: null } : r,
      ),
    );
  }
  function changeQuantity(key: string, nextQty: string) {
    setItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const oldQ = Number(r.quantity);
        const newQ = Number(nextQty);
        // Scale the anchors proportionally so per-unit density stays constant.
        // Skip when either quantity is non-numeric or would divide by zero.
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

  /** Build the per-item payload (name/qty/unit + grams/calories anchors). */
  function itemsPayload() {
    return items
      .map((r) => {
        const q = Number(r.quantity);
        return {
          name: r.name.trim(),
          quantity: q > 0 ? q : 1, // reject 0 / negative / NaN
          unit: r.unit.trim() || null,
          grams: r.grams,
          calories: r.calories,
        };
      })
      .filter((r) => r.name);
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
        note: draft.note ?? null,
        source,
        photo_uris: draft.photo_uris,
      });
      setDraft(next);
      setItems(toEditItems(next));
      setCorrection("");
      onRefined?.(next);
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
      note: draft.note ?? null,
      source,
      photo_uri: draft.photo_uri,
      photo_uris: draft.photo_uris,
      // datetime-local is local wall-clock; send UTC so the server stores it in
      // the same frame as server-generated times (see _normalize_eaten_at).
      eaten_at: eatenAt ? new Date(eatenAt).toISOString() : null,
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
              onChange={(e) => changeName(it.key, e.target.value)}
              placeholder="e.g. chicken burrito"
              aria-label="Item name"
            />
            <input
              className="input"
              type="number"
              min={0}
              step="0.25"
              value={it.quantity}
              onChange={(e) => changeQuantity(it.key, e.target.value)}
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

      {/* Natural-language correction — re-estimates the whole draft in one shot. */}
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

      <PhotoGallery
        photos={meal.photo_uris?.length ? meal.photo_uris : meal.photo_uri ? [meal.photo_uri] : []}
        alt={meal.description}
      />

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
