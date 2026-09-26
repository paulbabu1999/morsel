/**
 * First-run welcome + "your why" — stored per-user in localStorage (not the
 * backend, so no schema/API change). The "why" is a personal motivation line we
 * surface later as a gentle nudge on the dashboard.
 */

const seenKey = (uid: string) => `bite_welcome_seen:${uid}`;
const whyKey = (uid: string) => `bite_your_why:${uid}`;

export function hasSeenWelcome(uid: string): boolean {
  try {
    return localStorage.getItem(seenKey(uid)) === "1";
  } catch {
    return true; // storage disabled — don't trap the user behind a welcome
  }
}

export function markWelcomeSeen(uid: string): void {
  try {
    localStorage.setItem(seenKey(uid), "1");
  } catch {
    /* ignore */
  }
}

export function getYourWhy(uid: string): string {
  try {
    return localStorage.getItem(whyKey(uid)) ?? "";
  } catch {
    return "";
  }
}

export function setYourWhy(uid: string, why: string): void {
  try {
    const trimmed = why.trim();
    if (trimmed) localStorage.setItem(whyKey(uid), trimmed);
    else localStorage.removeItem(whyKey(uid));
  } catch {
    /* ignore */
  }
}
