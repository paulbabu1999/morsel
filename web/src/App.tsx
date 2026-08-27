import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
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
  const needsOnboarding = loaded && profile === null && pathname !== "/profile";

  return (
    <div className="app-shell">
      <Sidebar />
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
