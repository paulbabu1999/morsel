import { useEffect, useState } from "react";
import { PageHead } from "../components/ui";
import { IconBell, IconCheck } from "../components/icons";

/* ------------------------------------------------------------------ *
 * Meal reminders
 *
 * Honest scope: the web can't reliably fire a notification while the tab is
 * fully closed (that needs push infrastructure we don't run at $0). So this
 * gives you: a gentle in-app nudge whenever the app is open past a reminder
 * time you haven't logged, plus a real OS notification when the app is open or
 * backgrounded. Reliable background reminders come with the installed app.
 *
 * Preferences live in localStorage; the scheduler (useReminderScheduler, wired
 * in App) reads them.
 * ------------------------------------------------------------------ */

export interface ReminderPrefs {
  enabled: boolean;
  times: string[]; // "HH:MM" local, e.g. ["08:30","13:00","19:30"]
}

export const REMINDER_KEY = "bite_reminders";
const DEFAULT_TIMES = ["08:30", "13:00", "19:30"];

export function loadReminderPrefs(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ReminderPrefs;
      if (Array.isArray(p.times)) return { enabled: !!p.enabled, times: p.times };
    }
  } catch {
    /* fall through to defaults */
  }
  return { enabled: false, times: DEFAULT_TIMES };
}

function savePrefs(p: ReminderPrefs) {
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify(p));
  } catch {
    /* storage disabled */
  }
}

function notifSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Fires a gentle OS notification when a reminder time arrives — best-effort while
 *  the app is open or backgrounded. Deduped to once per time per day. Wired once
 *  in the app shell. */
export function useReminderScheduler() {
  useEffect(() => {
    if (!notifSupported()) return;
    const FIRED_KEY = "bite_reminders_fired";
    const tick = () => {
      const prefs = loadReminderPrefs();
      if (!prefs.enabled || Notification.permission !== "granted") return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (!prefs.times.includes(hhmm)) return;
      const key = `${now.toISOString().slice(0, 10)} ${hhmm}`;
      let fired: Record<string, unknown> = {};
      try {
        fired = JSON.parse(localStorage.getItem(FIRED_KEY) || "{}");
      } catch {
        fired = {};
      }
      if (fired[key]) return;
      // Keep the map small — only today's entries matter.
      const today = now.toISOString().slice(0, 10);
      const pruned: Record<string, unknown> = { [key]: 1 };
      for (const k of Object.keys(fired)) if (k.startsWith(today)) pruned[k] = 1;
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify(pruned));
      } catch {
        /* ignore */
      }
      try {
        new Notification("Time to log your meal", {
          body: "A quick photo keeps you in the game.",
        });
      } catch {
        /* needs a SW in some browsers — harmless to skip */
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
}

export function Reminders() {
  const [prefs, setPrefs] = useState<ReminderPrefs>(() => loadReminderPrefs());
  const [perm, setPerm] = useState<NotificationPermission>(
    notifSupported() ? Notification.permission : "denied",
  );

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  async function enable() {
    if (!notifSupported()) return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      setPrefs((s) => ({ ...s, enabled: true }));
      // A confirming ping so the user sees what a reminder looks like.
      try {
        new Notification("Reminders on", { body: "I'll give you a gentle nudge at meal times." });
      } catch {
        /* some browsers require a SW registration for this — harmless */
      }
    }
  }

  function setTime(i: number, value: string) {
    setPrefs((s) => ({ ...s, times: s.times.map((t, idx) => (idx === i ? value : t)) }));
  }
  function addTime() {
    setPrefs((s) => ({ ...s, times: [...s.times, "12:00"] }));
  }
  function removeTime(i: number) {
    setPrefs((s) => ({ ...s, times: s.times.filter((_, idx) => idx !== i) }));
  }

  const on = prefs.enabled && perm === "granted";

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Meal reminders"
        subtitle="A gentle nudge to log your meals — consistency is what actually moves the needle, not perfection."
      />

      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="card-head">
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconBell width={18} height={18} /> Reminders
          </div>
          {on && <span style={{ color: "var(--good)", fontWeight: 600, fontSize: 13 }}>On</span>}
        </div>

        {!notifSupported() ? (
          <div className="card-hint">
            This browser doesn't support notifications. The installed app will.
          </div>
        ) : perm !== "granted" ? (
          <>
            <p className="card-hint" style={{ marginBottom: 14 }}>
              Turn on notifications and I'll nudge you at your meal times when the app is open.
            </p>
            <button className="btn btn-primary" onClick={enable}>
              <IconBell width={16} height={16} /> Turn on reminders
            </button>
            {perm === "denied" && (
              <div className="card-hint" style={{ marginTop: 10 }}>
                Notifications are blocked in your browser settings — allow them for this site to use reminders.
              </div>
            )}
          </>
        ) : (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={prefs.enabled}
                onChange={(e) => setPrefs((s) => ({ ...s, enabled: e.target.checked }))}
              />
              <span style={{ fontWeight: 600 }}>Remind me to log meals</span>
            </label>

            <div className="label" style={{ marginBottom: 8 }}>Times</div>
            <div className="grid" style={{ gap: 8 }}>
              {prefs.times.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="input"
                    type="time"
                    value={t}
                    onChange={(e) => setTime(i, e.target.value)}
                    style={{ maxWidth: 160 }}
                  />
                  <button className="btn btn-ghost" onClick={() => removeTime(i)} aria-label="Remove time">
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={addTime} style={{ marginTop: 10 }}>
              + Add a time
            </button>

            <div className="stub-note" style={{ marginTop: 18 }}>
              <IconCheck width={16} height={16} />
              <div>
                Reminders fire while the app is open or in the background. For nudges when the
                app is fully closed, install Bite to your home screen (or use the phone app).
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
