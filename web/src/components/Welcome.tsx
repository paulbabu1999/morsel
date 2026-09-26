import { useState } from "react";
import { markWelcomeSeen, setYourWhy } from "../lib/welcome";
import { IconAsk, IconCamera, IconCheck, IconTarget } from "./icons";

const WHY_EXAMPLES = [
  "Feel more energetic day to day",
  "Keep up with my kids",
  "Fit into clothes I love",
  "Better numbers at my next checkup",
];

const VALUE_PROPS = [
  {
    icon: <IconCamera />,
    title: "Snap it, or say it",
    desc: "Photograph a meal or type a quick note — Bite drafts the nutrition for you.",
  },
  {
    icon: <IconTarget />,
    title: "Track toward your goal",
    desc: "See each day against a calorie + protein target built around you.",
  },
  {
    icon: <IconAsk />,
    title: "Ask your food memory",
    desc: "“How much protein this week?” — ask your history in plain English.",
  },
];

/**
 * First-run intro shown once per user. Two calm screens: what Bite does, then a
 * personal "why". Both are skippable — never a wall between the user and the app.
 */
export function Welcome({ uid, onDone }: { uid: string; onDone: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [why, setWhy] = useState("");

  function finish(saveWhy: boolean) {
    if (saveWhy) setYourWhy(uid, why);
    markWelcomeSeen(uid);
    onDone();
  }

  return (
    <div className="welcome-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Bite">
      <div className="welcome-card">
        <div className="welcome-dots" aria-hidden>
          <span className={step === 0 ? "on" : ""} />
          <span className={step === 1 ? "on" : ""} />
        </div>

        {step === 0 ? (
          <>
            <div className="welcome-eyebrow">Welcome to Bite</div>
            <h1 className="welcome-title">Food tracking that feels kind 🍽️</h1>
            <p className="welcome-lede">
              A gentle way to remember what you eat and move toward your goal — no
              guilt, no scoreboard.
            </p>
            <div className="welcome-props">
              {VALUE_PROPS.map((p) => (
                <div className="welcome-prop" key={p.title}>
                  <div className="welcome-prop-icon">{p.icon}</div>
                  <div>
                    <div className="welcome-prop-title">{p.title}</div>
                    <div className="welcome-prop-desc">{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="welcome-actions">
              <button className="btn btn-ghost" onClick={() => finish(false)}>
                Skip
              </button>
              <button className="btn btn-primary" onClick={() => setStep(1)}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="welcome-eyebrow">One quick thing</div>
            <h1 className="welcome-title">What's your why?</h1>
            <p className="welcome-lede">
              A line about why this matters to you. We'll bring it back on the days a
              little nudge helps. Just for you — never shared.
            </p>
            <textarea
              className="textarea welcome-why"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="e.g. I want more energy to keep up with my kids"
              autoFocus
              maxLength={160}
            />
            <div className="welcome-chips">
              {WHY_EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  className="chip"
                  onClick={() => setWhy(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="welcome-actions">
              <button className="btn btn-ghost" onClick={() => finish(false)}>
                Skip
              </button>
              <button className="btn btn-primary" onClick={() => finish(true)}>
                <IconCheck />
                {why.trim() ? "Let's go" : "Start tracking"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
