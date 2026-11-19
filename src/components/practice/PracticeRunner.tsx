"use client";

import { useMemo, useState } from "react";
import { HoldButton } from "@/components/operator/HoldButton";
import { LiveConsole } from "@/components/operator/LiveConsole";
import { OperatorRuntime } from "@/components/operator/OperatorRuntime";
import { PracticeContext } from "@/components/operator/practice-context";
import { operatorActions } from "@/lib/operator/actions";
import { enablePracticeBackend } from "@/lib/operator/backend";
import { elapsedSeconds } from "@/lib/operator/clock";
import { useNow, useOperatorSnapshot } from "@/lib/operator/hooks";
import { operatorStore } from "@/lib/operator/store";
import { markPractice, visibleCues, type PracticeMark } from "@/lib/practice/script";
import { PRACTICE_MATCH_ID, practiceInitialState, practiceSeed } from "@/lib/practice/seed";

// The practice console runs entirely in this browser (nothing reaches real matches).
enablePracticeBackend();

export function PracticeRunner({ token, firstName }: { token: string; firstName: string | null }) {
  return (
    <OperatorRuntime>
      <Practice token={token} firstName={firstName} />
    </OperatorRuntime>
  );
}

function Practice({ token, firstName }: { token: string; firstName: string | null }) {
  const snap = useOperatorSnapshot();
  const [startedHere, setStarted] = useState(false);
  const seed = useMemo(() => practiceSeed(new Date().toISOString()), []);
  const state = snap.matches[PRACTICE_MATCH_ID];

  // An attempt already in progress on this device resumes where it left off.
  const started = startedHere || (!!state && state.phase !== "SCHEDULED");

  const begin = () => {
    operatorStore.reset(PRACTICE_MATCH_ID);
    operatorStore.setMatch(practiceInitialState());
    setStarted(true);
  };

  if (!snap.hydrated) return <p className="py-16 text-center text-sm font-bold text-ink-muted">Loading practice…</p>;

  if (!started || !state) return <Intro firstName={firstName} onStart={begin} />;

  if (state.phase === "SCHEDULED") {
    return (
      <div className="pb-40">
        <section className="mt-4 rounded-2xl border-[3px] border-ink p-4 text-center">
          <p className="text-sm font-bold text-ink-muted uppercase">Practice Blue v Practice Red</p>
          <p className="mt-1 font-display text-3xl font-extrabold uppercase">Ready for kick-off</p>
          <p className="mt-2 text-sm text-ink-muted">
            Watch the commentary bar at the bottom of the screen. Each time something happens, record it in the console.
          </p>
          <div className="mt-5">
            <HoldButton label="Kick off" tone="go" onConfirm={() => operatorActions.startMatch(PRACTICE_MATCH_ID)} />
          </div>
        </section>
        <CueBar />
      </div>
    );
  }

  return (
    <PracticeContext.Provider value={{ done: <Finish token={token} firstName={firstName} onRestart={begin} /> }}>
      <div className="pb-40">
        <LiveConsole seed={seed} />
      </div>
      {state.phase !== "FULL_TIME" && <CueBar />}
    </PracticeContext.Provider>
  );
}

function Intro({ firstName, onStart }: { firstName: string | null; onStart: () => void }) {
  return (
    <section className="mx-auto max-w-xl py-6">
      <p className="text-sm font-bold tracking-wide text-brand-fg uppercase">Operator skills test</p>
      <h1 className="mt-1 font-display text-3xl leading-tight font-extrabold uppercase">
        {firstName ? `Welcome, ${firstName}` : "Welcome"}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        You will run a <b className="text-ink">practice match</b> in the real EKSU Sports Hub operator console. It is a made-up match
        (Practice Blue v Practice Red) that only exists on this phone: nothing you do here appears on the website.
      </p>
      <ol className="mt-4 space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
        <li><b>1.</b> Each half lasts <b>5 minutes</b>. The whole test takes about 12 minutes.</li>
        <li><b>2.</b> A <b>commentary bar</b> at the bottom tells you what happens on the pitch, with a hint on which button to use.</li>
        <li><b>3.</b> Record each event <b>as soon as it happens</b>: the right type, team and shirt number.</li>
        <li><b>4.</b> If the referee corrects something, fix it in the console.</li>
        <li><b>5.</b> At full-time, end the match, enter your name and submit. You will see your score.</li>
      </ol>
      <p className="mt-3 text-xs text-ink-faint">Tip: use the phone you would use on match day, and keep the screen on.</p>
      <button type="button" onClick={onStart} className="mt-5 h-14 w-full rounded-xl bg-brand-700 text-lg font-extrabold text-white uppercase">
        Start practice
      </button>
    </section>
  );
}

/** Fixed bar with the latest commentary line and how to record it. */
function CueBar() {
  const snap = useOperatorSnapshot();
  const now = useNow();
  const state = snap.matches[PRACTICE_MATCH_ID];
  if (!state || !now) return null;
  const cues = visibleCues(state, elapsedSeconds(state.clock, now));
  const latest = cues[cues.length - 1];
  if (!latest) return null;
  return (
    <aside aria-live="assertive" className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-accent-500 bg-ink px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-2xl">
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-extrabold tracking-widest text-accent-400 uppercase">
          On the pitch · {cues.length}/{11}
        </p>
        <p className="mt-0.5 text-lg leading-snug font-extrabold">{latest.text}</p>
        <p className="mt-1 text-sm text-white/75">{latest.how}</p>
      </div>
    </aside>
  );
}

function Finish({ token, firstName, onRestart }: { token: string; firstName: string | null; onRestart: () => void }) {
  const snap = useOperatorSnapshot();
  const state = snap.matches[PRACTICE_MATCH_ID];
  const mark: PracticeMark | null = useMemo(() => (state ? markPractice(state) : null), [state]);
  const [name, setName] = useState(firstName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);
  if (!state || !mark) return null;

  async function submit() {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, state: { phase: state.phase, events: state.events, log: state.log } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Could not submit. Try again.");
      else {
        setSubmitted(d.score);
        operatorStore.reset(PRACTICE_MATCH_ID);
      }
    } catch {
      setError("You're offline. Connect and try again; your practice is saved on this phone.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted !== null) {
    return (
      <section className="mt-4 rounded-2xl border-[3px] border-win p-5 text-center">
        <p className="font-display text-3xl font-extrabold uppercase">Submitted</p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums">{submitted}<span className="text-2xl text-ink-muted">/100</span></p>
        <p className="mt-2 text-sm text-ink-muted">Thank you{name ? `, ${name.split(" ")[0]}` : ""}. The EKSU Sports Hub team will review your result and contact you.</p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border-[3px] border-ink p-4" aria-live="polite">
      <p className="text-center font-display text-3xl font-extrabold uppercase">Full-time</p>
      <p className="text-center text-6xl font-extrabold tabular-nums">
        {mark.score}
        <span className="text-2xl text-ink-muted">/100</span>
      </p>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
        {mark.items.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <span>
              <span className="font-semibold">{i.label}</span>
              {i.note && <span className="block text-xs text-ink-faint">{i.note}</span>}
            </span>
            <span className={`shrink-0 font-bold tabular-nums ${i.points === i.max ? "text-win" : i.points === 0 ? "text-loss" : ""}`}>
              {i.points}/{i.max}
            </span>
          </li>
        ))}
      </ul>
      <label htmlFor="practice-name" className="mt-5 block text-sm font-bold">
        Your full name
      </label>
      <input
        id="practice-name"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 80))}
        autoComplete="name"
        className="mt-1 h-12 w-full rounded-xl border-2 border-line-strong bg-surface px-3 text-[16px] outline-none focus:border-brand-600"
      />
      {error && <p role="alert" className="mt-2 text-sm font-bold text-loss">{error}</p>}
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={submit}
        className="mt-3 h-14 w-full rounded-xl bg-brand-700 text-lg font-extrabold text-white uppercase disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit my result"}
      </button>
      <button type="button" onClick={onRestart} className="mt-2 h-11 w-full rounded-xl text-sm font-bold text-ink-muted hover:bg-subtle">
        Start the practice again instead
      </button>
      <p className="mt-1 text-center text-xs text-ink-faint">You can submit once. Practising again first is fine.</p>
    </section>
  );
}
