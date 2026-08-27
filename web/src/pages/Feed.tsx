import { Link } from "react-router-dom";
import { api } from "../api";
import type { FeedItem } from "../api";
import { useAsync } from "../lib/useAsync";
import { PageHead } from "../components/ui";
import { ErrorState, Loading } from "../components/states";
import { FeedList } from "../components/FeedCard";
import { IconUsers } from "../components/icons";

export function Feed() {
  const { data, loading, error, reload } = useAsync<FeedItem[]>(
    () => api.getFeed(),
    [],
  );

  return (
    <>
      <PageHead
        eyebrow="Community"
        title="Feed"
        subtitle="A quiet, encouraging look at what friends and your groups are eating. No numbers, no scoreboard — just good company."
      />

      {loading && <Loading label="Loading your feed…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && data.length === 0 && (
        <div className="card card-pad">
          <div className="state" style={{ padding: "44px 20px" }}>
            <div className="state-icon">
              <IconUsers />
            </div>
            <div className="state-title">Your feed is quiet</div>
            <div className="state-msg">
              Follow a friend or join a group to see what people are eating.
            </div>
            <Link className="btn btn-primary" to="/friends" style={{ marginTop: 4 }}>
              Find friends &amp; groups
            </Link>
          </div>
        </div>
      )}

      {data && data.length > 0 && <FeedList items={data} onChanged={reload} />}
    </>
  );
}
