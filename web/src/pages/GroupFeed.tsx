import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import type { FeedItem } from "../api";
import { useAsync } from "../lib/useAsync";
import { ErrorState, Loading } from "../components/states";
import { FeedList } from "../components/FeedCard";
import { IconArrowLeft, IconUsers } from "../components/icons";

export function GroupFeed() {
  const { id = "" } = useParams();

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  // Fetched separately so the header shows the group's name even before any
  // meal is shared (and works when the feed is empty).
  const groups = useAsync(() => api.getGroups(), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getGroupFeed(id)
      .then((d) => {
        if (alive) setItems(d);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError({
          message: e instanceof ApiError ? e.message : String(e),
          status: e instanceof ApiError ? e.status : 0,
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, nonce]);

  const groupName =
    groups.data?.find((g) => g.id === id)?.name ?? items?.[0]?.group_name ?? "Group";

  const notMember = error?.status === 403;

  return (
    <>
      <Link to="/friends" className="back-link">
        <IconArrowLeft />
        Back to friends
      </Link>

      <header className="page-head">
        <div>
          <div className="eyebrow">Group feed</div>
          <h1 className="page-title">{groupName}</h1>
          <p className="page-subtitle">
            What this group is sharing — a supportive look, never a scoreboard.
          </p>
        </div>
      </header>

      {loading && <Loading label="Loading the group feed…" />}

      {notMember && (
        <div className="card card-pad">
          <div className="state" style={{ padding: "44px 20px" }}>
            <div className="state-icon">
              <IconUsers />
            </div>
            <div className="state-title">You're not in this group yet</div>
            <div className="state-msg">
              Ask whoever runs it for the invite code, then join from the Friends page.
            </div>
            <Link className="btn btn-primary" to="/friends" style={{ marginTop: 4 }}>
              Go to Friends
            </Link>
          </div>
        </div>
      )}

      {error && !notMember && <ErrorState message={error.message} onRetry={reload} />}

      {!loading && !error && items && items.length === 0 && (
        <div className="card card-pad">
          <div className="state" style={{ padding: "44px 20px" }}>
            <div className="state-icon">
              <IconUsers />
            </div>
            <div className="state-title">Nothing shared here yet</div>
            <div className="state-msg">
              Be the first to share a meal with the group — a small nudge goes a long way.
            </div>
            <Link className="btn btn-primary" to="/capture" style={{ marginTop: 4 }}>
              Log a meal to share
            </Link>
          </div>
        </div>
      )}

      {items && items.length > 0 && <FeedList items={items} onChanged={reload} />}
    </>
  );
}
