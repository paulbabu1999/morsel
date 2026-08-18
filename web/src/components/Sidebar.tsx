import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import {
  IconAsk,
  IconCamera,
  IconHistory,
  IconHome,
  IconLogout,
  IconUser,
} from "./icons";

const LINKS = [
  { to: "/capture", label: "Capture", Icon: IconCamera, end: false },
  { to: "/dashboard", label: "Dashboard", Icon: IconHome, end: false },
  { to: "/history", label: "History", Icon: IconHistory, end: false },
  { to: "/ask", label: "Ask", Icon: IconAsk, end: false },
  { to: "/profile", label: "Profile", Icon: IconUser, end: false },
];

function HealthPill() {
  const { data, loading, error } = useAsync(() => api.health(), []);
  const status = loading ? "pending" : error ? "down" : "ok";
  const text = loading
    ? "Connecting…"
    : error
      ? "Backend offline"
      : `Demo · ${data?.db.meals ?? 0} sample meals`;
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

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="7.5" stroke="#1a0f08" strokeWidth="2.4" />
            <circle cx="12" cy="12" r="2.4" fill="#1a0f08" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Bite</div>
          <div className="brand-sub">food memory</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-label">Menu</div>
        {LINKS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
