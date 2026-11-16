"use client";

import { useState } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { playerStatuses } from "@/lib/operator/engine";
import type { AssignmentSeed, OpEventType, OpMatchState, Side } from "@/lib/operator/types";
import { ChosenTeam, ConfirmButton, ErrorNote, ShirtGrid, TeamPicker } from "../pickers";
import { useSubmit } from "./useSubmit";

type Step = Extract<OpEventType, "PENALTY_AWARDED" | "PENALTY_GOAL" | "PENALTY_MISS" | "PENALTY_SAVED">;

const STEPS: { value: Step; label: string }[] = [
  { value: "PENALTY_AWARDED", label: "Awarded" },
  { value: "PENALTY_GOAL", label: "Scored" },
  { value: "PENALTY_MISS", label: "Missed" },
  { value: "PENALTY_SAVED", label: "Saved" },
];

const PENALTY_TYPES: readonly OpEventType[] = ["PENALTY_AWARDED", "PENALTY_GOAL", "PENALTY_MISS", "PENALTY_SAVED"];

/** True when this side's latest (non-voided) penalty event is an award still waiting for its outcome. */
export function awaitingOutcome(state: OpMatchState, side: Side): boolean {
  const last = [...state.events].reverse().find((e) => !e.voided && e.side === side && PENALTY_TYPES.includes(e.type));
  return last?.type === "PENALTY_AWARDED";
}

/**
 * PENALTY → team → Awarded | Scored | Missed | Saved → CONFIRM.
 * "Awarded" never changes the score; only "Scored" records a penalty goal
 * (the same PENALTY_GOAL the Goal button records). Regulation time only —
 * not a penalty shoot-out.
 */
export function PenaltyFlow({
  seed,
  state,
  onDone,
}: {
  seed: AssignmentSeed;
  state: OpMatchState;
  onDone: (eventId: string, label: string, scored: boolean) => void;
}) {
  const { homeTeam, awayTeam } = seed.match;
  const [side, setSide] = useState<Side | null>(null);
  const [step, setStep] = useState<Step>("PENALTY_AWARDED");
  const [shirt, setShirt] = useState<number | null>(null);
  const { submit, error, setError } = useSubmit((r) => onDone(r.eventId!, `${LABEL[step]} · ${team!.shortName}`, step === "PENALTY_GOAL"));
  const team = side === "home" ? homeTeam : side === "away" ? awayTeam : null;

  if (!side || !team) {
    return (
      <TeamPicker
        home={homeTeam}
        away={awayTeam}
        prompt="Which team has the penalty?"
        onPick={(s) => {
          setSide(s);
          setStep(awaitingOutcome(state, s) ? "PENALTY_GOAL" : "PENALTY_AWARDED");
        }}
      />
    );
  }

  const pending = awaitingOutcome(state, side);
  return (
    <div>
      <ChosenTeam team={team} side={side} label="Penalty to" onChange={() => { setSide(null); setShirt(null); setError(null); }} />
      <ErrorNote message={error} />
      {pending && (
        <p className="mb-3 rounded-lg border-2 border-ink bg-accent-100 px-3 py-2 text-sm font-bold">Penalty awarded — record how it was taken.</p>
      )}
      <fieldset className="mb-4">
        <legend className="mb-2 text-base font-bold">What happened?</legend>
        <div className="grid grid-cols-4 gap-2">
          {STEPS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={step === s.value}
              onClick={() => { setStep(s.value); setShirt(null); setError(null); }}
              className={`h-12 rounded-lg border-2 text-sm font-bold ${step === s.value ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {step === "PENALTY_AWARDED" ? "Shown to the public straight away. The score does not change." : step === "PENALTY_GOAL" ? "Adds one goal." : "The score does not change."}
        </p>
      </fieldset>
      {step !== "PENALTY_AWARDED" && (
        <ShirtGrid
          side={side}
          legend="Penalty taker — optional"
          value={shirt}
          onChange={setShirt}
          statuses={playerStatuses(state, side)}
          unavailable={(_, s) => (s?.sentOff ? "Sent off" : s?.subbedOff ? "Off" : null)}
          allowUnknown
          scope="onField"
        />
      )}
      <div className="sticky -bottom-4 -mx-4 mt-4 -mb-4 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ConfirmButton
          tone={step === "PENALTY_GOAL" ? "go" : "brand"}
          label={`Confirm ${LABEL[step].toLowerCase()} · ${team.shortName}`}
          onClick={() =>
            submit(() =>
              operatorActions.recordEvent(state.matchId, { type: step, side, shirt: step === "PENALTY_AWARDED" ? null : shirt }),
            )
          }
        />
      </div>
    </div>
  );
}

const LABEL: Record<Step, string> = {
  PENALTY_AWARDED: "Penalty awarded",
  PENALTY_GOAL: "Penalty scored",
  PENALTY_MISS: "Penalty missed",
  PENALTY_SAVED: "Penalty saved",
};

/** INJURY → team → optional player → CONFIRM. Records only that play stopped for an injury. */
export function InjuryFlow({
  seed,
  state,
  onDone,
}: {
  seed: AssignmentSeed;
  state: OpMatchState;
  onDone: (eventId: string, label: string) => void;
}) {
  const { homeTeam, awayTeam } = seed.match;
  const [side, setSide] = useState<Side | null>(null);
  const [shirt, setShirt] = useState<number | null>(null);
  const team = side === "home" ? homeTeam : side === "away" ? awayTeam : null;
  const { submit, error, setError } = useSubmit((r) => onDone(r.eventId!, `Injury · ${team!.shortName}`));

  if (!side || !team) {
    return <TeamPicker home={homeTeam} away={awayTeam} prompt="Which team's player is injured?" onPick={setSide} />;
  }
  return (
    <div>
      <ChosenTeam team={team} side={side} label="Injury" onChange={() => { setSide(null); setShirt(null); setError(null); }} />
      <ErrorNote message={error} />
      <ShirtGrid
        side={side}
        legend="Player — optional"
        value={shirt}
        onChange={setShirt}
        statuses={playerStatuses(state, side)}
        unavailable={(_, s) => (s?.sentOff ? "Sent off" : s?.subbedOff ? "Off" : null)}
        allowUnknown
        scope="onField"
      />
      <p className="mt-3 text-xs text-ink-muted">Shows “Injury — play stopped”. Don’t record medical details. Pause the clock separately if play is stopped for long.</p>
      <div className="sticky -bottom-4 -mx-4 mt-4 -mb-4 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ConfirmButton
          tone="brand"
          label={`Confirm injury · ${team.shortName}`}
          onClick={() => submit(() => operatorActions.recordEvent(state.matchId, { type: "INJURY", side, shirt }))}
        />
      </div>
    </div>
  );
}
