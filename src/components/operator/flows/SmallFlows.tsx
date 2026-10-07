"use client";

import { useState } from "react";
import { TeamCrest } from "@/components/team/TeamCrest";
import { operatorActions } from "@/lib/operator/actions";
import { computeScore } from "@/lib/operator/engine";
import { periodLengthSeconds } from "@/lib/operator/clock";
import type { AssignmentSeed, OpEvent, OpMatchState, PauseReason } from "@/lib/operator/types";
import { HoldButton } from "../HoldButton";
import { EVENT_LABEL, PAUSE_REASONS } from "../labels";
import { ConfirmButton, ErrorNote } from "../pickers";
import { useSubmit } from "./useSubmit";

/** Announced stoppage: one tap on a preset, or a custom stepper (no typing). */
export function StoppageFlow({ state, onDone }: { state: OpMatchState; onDone: (minutes: number) => void }) {
  const current = Math.round(state.clock.stoppageSeconds / 60);
  const [custom, setCustom] = useState(Math.max(current, 6));
  const { submit, error } = useSubmit(() => {});
  const set = (m: number) => submit(() => {
    const r = operatorActions.setStoppage(state.matchId, m);
    if (r.ok) onDone(m);
    return r;
  });
  return (
    <div>
      <ErrorNote message={error} />
      <p className="mb-3 text-sm text-ink-muted">
        Shown to the public as e.g. <strong>{Math.ceil((state.clock.periodOffsetSeconds + periodLengthSeconds(state.clock.period, state.clock)) / 60)}+2&apos;</strong>. The match clock itself is not changed.
        {current > 0 && <> Currently announced: <strong>+{current}</strong>.</>}
      </p>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set(m)}
            aria-pressed={current === m}
            className={`h-16 rounded-xl border-2 font-display text-2xl font-extrabold ${current === m ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"}`}
          >
            +{m}
          </button>
        ))}
      </div>
      <fieldset className="mt-5">
        <legend className="mb-2 text-base font-bold">Custom</legend>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="One minute less" onClick={() => setCustom((c) => Math.max(1, c - 1))} className="h-14 w-14 rounded-xl border-2 border-line-strong text-2xl font-extrabold">−</button>
          <output className="flex-1 text-center font-display text-3xl font-extrabold" aria-live="polite">+{custom}</output>
          <button type="button" aria-label="One minute more" onClick={() => setCustom((c) => Math.min(30, c + 1))} className="h-14 w-14 rounded-xl border-2 border-line-strong text-2xl font-extrabold">+</button>
        </div>
        <div className="mt-3">
          <ConfirmButton tone="ink" label={`Set +${custom} minutes`} onClick={() => set(custom)} />
        </div>
      </fieldset>
      {current > 0 && (
        <button type="button" onClick={() => set(0)} className="mt-3 h-12 w-full rounded-xl border-2 border-line-strong font-bold">
          Clear announced stoppage
        </button>
      )}
    </div>
  );
}

/** Pause for an unusual interruption; the reason is recorded. */
export function PauseFlow({ state, onDone }: { state: OpMatchState; onDone: (reason: PauseReason) => void }) {
  const { submit, error } = useSubmit(() => {});
  return (
    <div>
      <ErrorNote message={error} />
      <p className="mb-3 text-sm text-ink-muted">The match clock stops until you resume. Choose why:</p>
      <div className="grid gap-2">
        {PAUSE_REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => submit(() => {
              const res = operatorActions.pauseMatch(state.matchId, r.value);
              if (res.ok) onDone(r.value);
              return res;
            })}
            className="h-14 rounded-xl border-2 border-line-strong bg-surface px-4 text-left text-lg font-bold hover:border-ink"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const CORRECTION_REASONS = ["Wrong team", "Wrong player", "Wrong event type", "Didn't happen", "Recorded twice"];

export function eventSummary(e: OpEvent, seed: AssignmentSeed) {
  const team = e.side === "home" ? seed.match.homeTeam : seed.match.awayTeam;
  const who = e.type === "SUBSTITUTION" ? `${e.shirtIn ?? "?"} on / ${e.shirt ?? "?"} off` : e.shirt !== null ? `No. ${e.shirt}` : "Unknown player";
  return `${e.addedTime ? `${e.minute}+${e.addedTime}` : e.minute}' ${EVENT_LABEL[e.type]} · ${team.shortName} · ${who}`;
}

/** Correct an older event: select → reason → confirm. Voids, never deletes. */
export function CorrectionFlow({
  seed,
  state,
  onDone,
}: {
  seed: AssignmentSeed;
  state: OpMatchState;
  onDone: (summary: string) => void;
}) {
  const [target, setTarget] = useState<OpEvent | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const { submit, error } = useSubmit(() => onDone(eventSummary(target!, seed)));
  const candidates = state.events.filter((e) => !e.voided).slice().reverse();

  if (!target) {
    return candidates.length === 0 ? (
      <p className="text-sm text-ink-muted">There are no events to correct.</p>
    ) : (
      <fieldset>
        <legend className="mb-2 text-base font-bold">1. Which event is wrong?</legend>
        <div className="grid gap-2">
          {candidates.map((e) => (
            <button key={e.id} type="button" onClick={() => setTarget(e)} className="min-h-14 rounded-xl border-2 border-line-strong bg-surface px-3 py-2 text-left font-bold hover:border-ink">
              {eventSummary(e, seed)}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <ErrorNote message={error} />
      <div className="mb-4 rounded-xl border-2 border-ink bg-subtle px-3 py-2">
        <p className="text-xs font-extrabold tracking-widest text-ink-muted uppercase">Event to void</p>
        <p className="font-bold">{eventSummary(target, seed)}</p>
        <button type="button" onClick={() => { setTarget(null); setReason(null); }} className="mt-1 h-10 text-sm font-bold underline">
          Choose a different event
        </button>
      </div>
      <fieldset>
        <legend className="mb-2 text-base font-bold">2. Reason</legend>
        <div className="grid grid-cols-2 gap-2">
          {CORRECTION_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={`min-h-12 rounded-lg border-2 px-2 text-sm font-bold ${reason === r ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="my-3 text-xs text-ink-muted">
        The event stays in the history marked VOIDED, and the score is recalculated. Record the correct event again if needed.
      </p>
      <ConfirmButton
        tone="danger"
        disabled={!reason}
        label={reason ? "Confirm correction" : "Choose a reason"}
        onClick={() => submit(() => operatorActions.voidEvent(state.matchId, target.id, `Correction: ${reason}`))}
      />
    </div>
  );
}

/** Full-time: verify the score, tick the check, then press-and-hold. */
export function FinaliseFlow({ seed, state, onDone }: { seed: AssignmentSeed; state: OpMatchState; onDone: () => void }) {
  const score = computeScore(state);
  const [checked, setChecked] = useState(false);
  const { submit, error } = useSubmit(onDone);
  const { homeTeam, awayTeam } = seed.match;
  return (
    <div>
      <ErrorNote message={error} />
      <p className="text-base font-bold">Verify the final score before ending the match.</p>
      <div className="my-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl border-[3px] border-ink p-4 text-center">
        <div className="flex min-w-0 flex-col items-center gap-1">
          <TeamCrest team={homeTeam} size="md" />
          <span className="line-clamp-2 text-sm font-bold">{homeTeam.name}</span>
        </div>
        <p className="font-display text-5xl font-extrabold tabular-nums">
          {score.home}<span className="px-1 text-ink-faint">–</span>{score.away}
        </p>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <TeamCrest team={awayTeam} size="md" />
          <span className="line-clamp-2 text-sm font-bold">{awayTeam.name}</span>
        </div>
      </div>
      <p className="sr-only">
        Final score: {homeTeam.name} {score.home}, {awayTeam.name} {score.away}.
      </p>
      <label className="mb-4 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-line-strong px-3 py-2 font-bold has-[:checked]:border-ink has-[:checked]:bg-subtle">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-6 accent-[var(--color-brand-700)]" />
        The score matches the referee&apos;s
      </label>
      <p className="mb-3 text-sm text-ink-muted">After full-time, events are locked. Later changes need an administrator.</p>
      <HoldButton
        key={error ?? "hold"}
        tone="danger"
        disabled={!checked}
        label="Hold to end match"
        durationMs={2000}
        hint={checked ? "Press and hold for 2 seconds" : "Confirm the score first"}
        onConfirm={() => submit(() => operatorActions.finaliseMatch(state.matchId, score))}
      />
    </div>
  );
}
