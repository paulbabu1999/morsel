import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api";
import type { Connections, GroupInfo, MeResponse, UserSummary } from "../api";
import { useAsync } from "../lib/useAsync";
import { PageHead } from "../components/ui";
import { ErrorState, Loading } from "../components/states";
import { IconCheck, IconPlus, IconUsers } from "../components/icons";

/** Friends & groups: set the name people find you by, follow friends, and manage
 *  groups. Supportive accountability by design — no numbers anywhere. */
export function Friends() {
  const me = useAsync<MeResponse>(() => api.getMe(), []);
  const connections = useAsync<Connections>(() => api.getConnections(), []);
  const groups = useAsync<GroupInfo[]>(() => api.getGroups(), []);

  return (
    <>
      <PageHead
        eyebrow="Community"
        title="Friends & groups"
        subtitle="Follow friends and share meals for a little gentle accountability — support, not a scoreboard."
      />

      <div className="grid two-col">
        <div className="grid" style={{ gap: 20 }}>
          <YourName me={me} />
          <FindPeople onChanged={() => connections.reload()} />
          <ConnectionsCard c={connections} />
        </div>
        <div className="grid" style={{ gap: 20 }}>
          <GroupsCard groups={groups} />
        </div>
      </div>
    </>
  );
}

/* ---------- Your display name ---------- */
function YourName({ me }: { me: ReturnType<typeof useAsync<MeResponse>> }) {
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const current = me.data?.display_name ?? "";
  const value = name ?? current;

  async function save() {
    if (!value.trim() || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.setDisplayName(value.trim());
      setSaved(true);
      me.reload();
    } catch {
      /* surfaced by the disabled/normal state; user can retry */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card card-pad">
      <div className="card-head">
        <div className="card-title">Your name</div>
        <div className="card-hint">how friends find you</div>
      </div>
      {me.loading ? (
        <Loading label="Loading…" />
      ) : (
        <div className="form-row" style={{ alignItems: "end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">Display name</label>
            <input
              className="input"
              value={value}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. Paul B"
              maxLength={40}
            />
          </div>
          <button className="btn btn-primary" onClick={save} disabled={saving || !value.trim()}>
            {saved ? <IconCheck width={16} height={16} /> : null}
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </div>
      )}
      {!current && (
        <div className="card-hint" style={{ marginTop: 10 }}>
          Set a name so friends can search for and follow you.
        </div>
      )}
    </section>
  );
}

/* ---------- Find people ---------- */
function FindPeople({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchUsers(q.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  function patch(id: string, following: boolean) {
    setResults((r) => r?.map((u) => (u.user_id === id ? { ...u, following } : u)) ?? r);
    onChanged();
  }

  return (
    <section className="card card-pad">
      <div className="card-head">
        <div className="card-title">Find friends</div>
      </div>
      <form onSubmit={search} style={{ display: "flex", gap: 10 }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit" disabled={searching || !q.trim()}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <div className="card-hint" style={{ marginTop: 12, color: "var(--danger)" }}>{error}</div>}

      {results && results.length === 0 && (
        <div className="card-hint" style={{ marginTop: 14 }}>No one found — try another name.</div>
      )}
      {results && results.length > 0 && (
        <div className="people-list" style={{ marginTop: 14 }}>
          {results.map((u) => (
            <PersonRow key={u.user_id} user={u} onChanged={patch} />
          ))}
        </div>
      )}
    </section>
  );
}

function PersonRow({
  user,
  onChanged,
}: {
  user: UserSummary;
  onChanged: (id: string, following: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (user.following) await api.unfollowUser(user.user_id);
      else await api.followUser(user.user_id);
      onChanged(user.user_id, !user.following);
    } catch {
      /* retry */
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="person-row">
      <div className="feed-avatar" aria-hidden="true">
        {user.display_name.trim().charAt(0).toUpperCase() || "·"}
      </div>
      <div className="person-name">{user.display_name}</div>
      <button
        className={`btn ${user.following ? "btn-ghost" : "btn-primary"}`}
        onClick={toggle}
        disabled={busy}
      >
        {user.following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

/* ---------- Following / followers ---------- */
function ConnectionsCard({ c }: { c: ReturnType<typeof useAsync<Connections>> }) {
  return (
    <section className="card card-pad">
      <div className="card-head">
        <div className="card-title">Your circle</div>
      </div>
      {c.loading && <Loading label="Loading…" />}
      {c.error && <ErrorState message={c.error} onRetry={c.reload} />}
      {c.data && (
        <>
          <div className="conn-sub">Following ({c.data.following.length})</div>
          {c.data.following.length === 0 ? (
            <div className="card-hint">You're not following anyone yet.</div>
          ) : (
            <div className="people-list">
              {c.data.following.map((u) => (
                <FollowingRow key={u.user_id} user={u} onChanged={c.reload} />
              ))}
            </div>
          )}
          <div className="conn-sub" style={{ marginTop: 16 }}>
            Followers ({c.data.followers.length})
          </div>
          {c.data.followers.length === 0 ? (
            <div className="card-hint">No followers yet.</div>
          ) : (
            <div className="people-list">
              {c.data.followers.map((u) => (
                <div className="person-row" key={u.user_id}>
                  <div className="feed-avatar" aria-hidden="true">
                    {u.display_name.trim().charAt(0).toUpperCase() || "·"}
                  </div>
                  <div className="person-name">{u.display_name}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FollowingRow({ user, onChanged }: { user: UserSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function unfollow() {
    if (busy) return;
    setBusy(true);
    try {
      await api.unfollowUser(user.user_id);
      onChanged();
    } catch {
      setBusy(false);
    }
  }
  return (
    <div className="person-row">
      <div className="feed-avatar" aria-hidden="true">
        {user.display_name.trim().charAt(0).toUpperCase() || "·"}
      </div>
      <div className="person-name">{user.display_name}</div>
      <button className="btn btn-ghost" onClick={unfollow} disabled={busy}>
        {busy ? "…" : "Unfollow"}
      </button>
    </div>
  );
}

/* ---------- Groups ---------- */
function GroupsCard({ groups }: { groups: ReturnType<typeof useAsync<GroupInfo[]>> }) {
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    if (!newName.trim() || busy) return;
    setBusy("create");
    setMsg(null);
    try {
      await api.createGroup(newName.trim());
      setNewName("");
      groups.reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function join() {
    if (!code.trim() || busy) return;
    setBusy("join");
    setMsg(null);
    try {
      await api.joinGroup(code.trim());
      setCode("");
      groups.reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "That invite code didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card card-pad">
      <div className="card-head">
        <div className="card-title">Groups</div>
        <div className="card-hint">private, invite-only</div>
      </div>

      {groups.loading && <Loading label="Loading…" />}
      {groups.error && <ErrorState message={groups.error} onRetry={groups.reload} />}
      {groups.data && groups.data.length > 0 && (
        <div className="group-list">
          {groups.data.map((g) => (
            <div className="group-row" key={g.id}>
              <div className="group-icon" aria-hidden="true">
                <IconUsers width={18} height={18} />
              </div>
              <div className="group-main">
                <Link to={`/groups/${g.id}`} className="group-name">
                  {g.name}
                </Link>
                <div className="group-meta">
                  {g.member_count} {g.member_count === 1 ? "member" : "members"}
                  {g.owner && g.invite_code ? (
                    <>
                      {" · code "}
                      <code className="invite-code">{g.invite_code}</code>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {groups.data && groups.data.length === 0 && (
        <div className="card-hint" style={{ marginBottom: 4 }}>
          No groups yet — start one for your family or friends, or join with a code.
        </div>
      )}

      <div className="group-actions">
        <div className="field">
          <label className="label">Start a group</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Family"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={create} disabled={busy === "create" || !newName.trim()}>
              <IconPlus width={16} height={16} />
              Create
            </button>
          </div>
        </div>
        <div className="field">
          <label className="label">Join with a code</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="INVITE CODE"
              style={{ flex: 1 }}
            />
            <button className="btn btn-ghost" onClick={join} disabled={busy === "join" || !code.trim()}>
              Join
            </button>
          </div>
        </div>
      </div>
      {msg && <div className="card-hint" style={{ marginTop: 10, color: "var(--danger)" }}>{msg}</div>}
    </section>
  );
}
