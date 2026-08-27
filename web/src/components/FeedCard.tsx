import { useState } from "react";
import { api } from "../api";
import type { FeedItem } from "../api";
import { timeAgo } from "../lib/format";
import { IconTrash } from "./icons";

/** First initial for the avatar, with a gentle fallback. */
function initial(name: string): string {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : "·";
}

/**
 * One shared meal, rendered the same way in the home feed and in a group feed.
 *
 * Supportive by design: a photo, what they ate, an optional note, and who
 * shared it — never calories, macros, or any ranking.
 */
export function FeedCard({
  item,
  onUnshared,
}: {
  item: FeedItem;
  /** Called after the current user un-shares their own item (to refetch). */
  onUnshared?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function unshare() {
    if (busy) return;
    setBusy(true);
    try {
      await api.unshare(item.id);
      onUnshared?.();
    } catch {
      // Best-effort: let the user try again.
      setBusy(false);
    }
  }

  const who = item.is_me ? "You" : item.display_name;

  return (
    <article className="feed-card card">
      <div className="feed-head">
        <div className={`feed-avatar${item.is_me ? " me" : ""}`} aria-hidden="true">
          {initial(item.display_name)}
        </div>
        <div className="feed-head-text">
          <div className="feed-who">
            <span className="feed-name">{who}</span> shared a{" "}
            <span className="feed-mealtype">{item.meal_type}</span>
            {item.group_id && item.group_name && (
              <span className="feed-group-chip" title={`Shared to ${item.group_name}`}>
                {item.group_name}
              </span>
            )}
          </div>
          <div className="feed-when">{timeAgo(item.shared_at)}</div>
        </div>
        {item.is_me && (
          <button
            type="button"
            className="btn btn-ghost feed-unshare"
            onClick={unshare}
            disabled={busy}
            title="Remove this from the feed"
          >
            <IconTrash width={15} height={15} />
            {busy ? "Removing…" : "Unshare"}
          </button>
        )}
      </div>

      {item.photo_uri && (
        <img className="feed-photo" src={item.photo_uri} alt={item.description} loading="lazy" />
      )}

      <div className="feed-desc">{item.description}</div>

      {item.note && <blockquote className="feed-note">{item.note}</blockquote>}
    </article>
  );
}

/** A calm vertical list of feed cards. Shared by the home + group feeds. */
export function FeedList({
  items,
  onChanged,
}: {
  items: FeedItem[];
  /** Refetch hook, invoked after an un-share. */
  onChanged?: () => void;
}) {
  return (
    <div className="feed-list">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} onUnshared={onChanged} />
      ))}
    </div>
  );
}
