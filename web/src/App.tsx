import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar, MobileNav } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Capture } from "./pages/Capture";
import { History } from "./pages/History";
import { MealDetail } from "./pages/MealDetail";
import { Ask } from "./pages/Ask";
import { Profile } from "./pages/Profile";
import { Feed } from "./pages/Feed";
import { Friends } from "./pages/Friends";
import { GroupFeed } from "./pages/GroupFeed";
import { Reminders, useReminderScheduler } from "./pages/Reminders";
import { Login } from "./pages/Login";
import { Invite } from "./pages/Invite";
import { ProfileProvider, useProfile } from "./lib/profile";
import { useAuth } from "./lib/auth";
import { Loading } from "./components/states";

/** Scroll to top on route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Top-level auth gate.
 *   - While the boot-time token check runs → a full-screen loader.
 *   - Logged out → only the public /login + /signup screens are reachable.
 *   - Logged in → the app (wrapped in ProfileProvider so onboarding stays in
 *     sync). Keying the provider by user id guarantees a fresh profile fetch
 *     when a different account signs in.
 */
export function App() {
  const { loaded, user } = useAuth();

  if (!loaded) {
    return (
      <div className="auth-boot">
        <Loading label="Loading Bite…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
        {/* Invite links must be reachable logged-out — it stashes the token and
            sends the visitor to sign in, then redeems after. */}
        <Route path="/invite/:token" element={<Invite />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ProfileProvider key={user.user_id}>
      <AppShell />
    </ProfileProvider>
  );
}

/** The authenticated app: sidebar + routed pages, with the onboarding gate. */
function AppShell() {
  const { loaded, profile } = useProfile();
  const { pathname } = useLocation();
  useReminderScheduler();

  // Onboarding gate: once the profile has loaded and is null, route the user
  // to the Profile page to set it up. Saving updates the shared context, which
  // clears this redirect. Errors fall through so the app is still usable.
  // Let invite links redeem before the onboarding gate takes over, so a brand-new
  // signup arriving via an invite still gets connected to their friend.
  const needsOnboarding =
    loaded && profile === null && pathname !== "/profile" && !pathname.startsWith("/invite");

  return (
    <div className="app-shell">
      <Sidebar />
      <MobileNav />
      <main className="main">
        <ScrollToTop />
        {needsOnboarding ? (
          <Navigate to="/profile" replace state={{ onboarding: true }} />
        ) : (
          <Routes>
            {/* Capture is the landing page — the app is built around fast
                photo capture, so an authenticated user lands here. */}
            <Route path="/" element={<Navigate to="/capture" replace />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/meals/:id" element={<MealDetail />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/groups/:id" element={<GroupFeed />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/invite/:token" element={<Invite />} />
            {/* Auth screens are public-only; once signed in, bounce home. */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
