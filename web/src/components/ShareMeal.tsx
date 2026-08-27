import { useState } from "react";
import { ApiError, api } from "../api";
import type { GroupInfo } from "../api";
import { useAsync } from "../lib/useAsync";
import { IconCheck, IconShare } from "./icons";

/** Opt-in share for a saved meal — to your followers or a private group, with an
 *  optional note. Sharing publishes a photo + description only (never calories),
 *  so the feed stays supportive, not comparative. */
export function ShareMeal({ mealId }: { mealId: string }) {
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState("followers"); // "followers" | groupId
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groups = useAsync<GroupInfo[]>(() => api.getGroups(), []);

  async function share() {
    setBusy(true);
    setErr(null);
    try {
      await api.shareMeal(mealId, {
        group_id: dest === "followers" ? null : dest,
        note: note.trim() || null,
      });
      setShared(true);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (shared) {
    return (
      <span className="btn btn-ghost" style={{ color: "var(--good)", pointerEvents: "none" }}>
        <IconCheck width={16} height={16} /> Shared
      </span>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        <IconShare width={16} height={16} /> Share
      </button>
    );
  }

  return (
    <div className="share-panel card">
      <div className="card-title" style={{ fontSize: 15, marginBottom: 12 }}>
        Share this meal
      </div>
      <div className="field">
        <label className="label">With</label>
        <select className="select" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="followers">My followers</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">
          Note <span className="opt">· optional</span>
        </label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Say something…"
          maxLength={140}
        />
      </div>
      {err && <div className="card-hint" style={{ color: "var(--danger)" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn btn-primary" onClick={share} disabled={busy}>
          {busy ? "Sharing…" : "Share"}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
