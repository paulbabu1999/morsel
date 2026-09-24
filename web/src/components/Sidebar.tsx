import { useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import {
  IconAsk,
  IconBell,
  IconCamera,
  IconHistory,
  IconHome,
  IconLogout,
  IconUser,
  IconUsers,
} from "./icons";

type Link = { to: string; label: string; Icon: typeof IconHome };

/** The four everyday destinations get first-class spots (desktop nav + the
 *  mobile bottom bar); the rest live under "More" on mobile. */
const PRIMARY: Link[] = [
  { to: "/capture", label: "Capture", Icon: IconCamera },
  { to: "/dashboard", label: "Dashboard", Icon: IconHome },
  { to: "/history", label: "History", Icon: IconHistory },
  { to: "/ask", label: "Ask", Icon: IconAsk },
];
const SECONDARY: Link[] = [
  { to: "/feed", label: "Feed", Icon: IconUsers },
  { to: "/friends", label: "Friends", Icon: IconUsers },
  { to: "/reminders", label: "Reminders", Icon: IconBell },
  { to: "/profile", label: "Profile", Icon: IconUser },
];
const LINKS = [...PRIMARY, ...SECONDARY];

function IconDots() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="7.5" stroke="#1a0f08" strokeWidth="2.4" />
        <circle cx="12" cy="12" r="2.4" fill="#1a0f08" />
      </svg>
    </div>
  );
}

function HealthPill() {
  const { data, loading, error } = useAsync(() => api.health(), []);
  const status = loading ? "pending" : error ? "down" : "ok";
  const text = loading ? "Connecting…" : error ? "Backend offline" : "Connected";
  const tip = error ?? (data ? `Storage: Postgres · LLM: ${data.llm}` : "");
  return (
    <div className="demo-pill" title={tip}>
      <span className={`dot ${status}`} />
      <span className="demo-text">{text}</span>
    </div>
  );
}

function Account() {
  const { user, signOut } = useAuth();
  return (
    <div className="account">
      <span className="account-email" title={user?.email}>
        {user?.email ?? "Signed in"}
      </span>
      <button
        type="button"
        className="account-logout"
        onClick={signOut}
        aria-label="Log out"
      >
        <IconLogout />
        <span>Log out</span>
      </button>
    </div>
  );
}

/** Desktop: a persistent left rail with every destination. */
export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">Bite</div>
          <div className="brand-sub">food memory</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-label">Menu</div>
        {LINKS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <Account />
        <HealthPill />
      </div>
    </aside>
  );
}

/** Mobile: a fixed bottom tab bar (four everyday tabs + a "More" sheet). A
 *  thumb-reachable, label-first bar beats a cramped scrolling icon row. */
export function MobileNav() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="mobile-topbar">
        <div className="brand" style={{ padding: 0, gap: 9 }}>
          <BrandMark />
          <span className="brand-name">Bite</span>
        </div>
        <HealthPill />
      </header>

      {open && (
        <>
          <div className="mnav-scrim" onClick={() => setOpen(false)} />
          <div className="mnav-sheet" role="menu">
            <div className="mnav-sheet-grid">
              {SECONDARY.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `mnav-sheet-link${isActive ? " active" : ""}`
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
            <div className="mnav-sheet-foot">
              <span className="account-email" title={user?.email}>
                {user?.email ?? "Signed in"}
              </span>
              <button
                type="button"
                className="account-logout"
                onClick={signOut}
                aria-label="Log out"
              >
                <IconLogout />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </>
      )}

      <nav className="mobile-tabbar" aria-label="Primary">
        {PRIMARY.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) => `mtab${isActive ? " active" : ""}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`mtab${open ? " active" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="More"
          aria-expanded={open}
        >
          <IconDots />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
