import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../lib/auth";
import { Loading } from "../components/states";
import { IconAlert, IconCheck, IconUsers } from "../components/icons";

/** Shared key so Login can redeem a stashed invite after the user signs in. */
export const PENDING_INVITE_KEY = "bite_pending_invite";

type State = "working" | "done" | "self" | "error";

/**
 * Handles `/invite/:token`. Logged in → redeem it (mutual-follow the inviter).
 * Logged out → stash the token and bounce to login; Login redeems it on success.
 */
export function Invite() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("working");
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    if (!user) {
      try {
        localStorage.setItem(PENDING_INVITE_KEY, token);
      } catch {
        /* storage disabled — the token in the URL still works if they come back */
      }
      navigate("/login", { replace: true });
      return;
    }
    ran.current = true;
    api
      .acceptInvite(token)
      .then((r) => {
        try {
          localStorage.removeItem(PENDING_INVITE_KEY);
        } catch {
          /* ignore */
        }
        if (r.self) setState("self");
        else {
          setName(r.display_name);
          setState("done");
        }
      })
      .catch((e) => {
        setMsg(e?.message ?? "This invite link didn't work.");
        setState("error");
      });
  }, [token, user, navigate]);

  return (
    <div className="center-narrow" style={{ paddingTop: 32 }}>
      <section className="card card-pad" style={{ textAlign: "center", padding: "44px 28px" }}>
        {state === "working" && <Loading label="Connecting you…" />}

        {state === "done" && (
          <>
            <div className="state-icon" style={{ margin: "0 auto 10px", color: "var(--good)" }}>
              <IconCheck />
            </div>
            <h1 className="page-title" style={{ marginBottom: 8 }}>You're connected!</h1>
            <p className="page-subtitle" style={{ margin: "0 auto 20px" }}>
              You and <b>{name}</b> now follow each other — you'll see each other's shared
              meals in your feed.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Link className="btn btn-primary" to="/feed">
                Go to feed
              </Link>
              <Link className="btn btn-ghost" to="/friends">
                Friends
              </Link>
            </div>
          </>
        )}

        {state === "self" && (
          <>
            <div className="state-icon" style={{ margin: "0 auto 10px", color: "var(--brand-deep)" }}>
              <IconUsers />
            </div>
            <h1 className="page-title" style={{ marginBottom: 8 }}>That's your own link</h1>
            <p className="page-subtitle" style={{ margin: "0 auto 20px" }}>
              Send it to a friend so they can connect with you in one tap.
            </p>
            <Link className="btn btn-primary" to="/friends">
              Back to Friends
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <div className="state-icon" style={{ margin: "0 auto 10px", color: "var(--danger)" }}>
              <IconAlert />
            </div>
            <h1 className="page-title" style={{ marginBottom: 8 }}>Invite didn't work</h1>
            <p className="page-subtitle" style={{ margin: "0 auto 20px" }}>{msg}</p>
            <Link className="btn btn-primary" to="/friends">
              Go to Friends
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
