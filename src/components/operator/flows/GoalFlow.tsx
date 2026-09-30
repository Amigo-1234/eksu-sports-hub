"use client";

import { useState } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { playerStatuses } from "@/lib/operator/engine";
import type { AssignmentSeed, OpEventType, OpMatchState, Side } from "@/lib/operator/types";
import { ChosenTeam, ConfirmButton, ErrorNote, ShirtGrid, TeamPicker } from "../pickers";
import { useSubmit } from "./useSubmit";

type GoalKind = Extract<OpEventType, "GOAL" | "PENALTY_GOAL" | "OWN_GOAL">;

const KINDS: { value: GoalKind; label: string }[] = [
  { value: "GOAL", label: "Goal" },
  { value: "PENALTY_GOAL", label: "Penalty" },
  { value: "OWN_GOAL", label: "Own goal" },
];

/** GOAL → team → CONFIRM (shirt and goal type optional). Three taps. */
export function GoalFlow({
  seed,
  state,
  onDone,
}: {
  seed: AssignmentSeed;
  state: OpMatchState;
  onDone: (eventId: string, scoringSide: Side) => void;
}) {
  const { homeTeam, awayTeam } = seed.match;
  const [side, setSide] = useState<Side | null>(null);
  const [kind, setKind] = useState<GoalKind>("GOAL");
  const [shirt, setShirt] = useState<number | null>(null);
  const { submit, error, setError } = useSubmit((r) => onDone(r.eventId!, side!));

  if (!side) {
    return <TeamPicker home={homeTeam} away={awayTeam} prompt="Which team scored?" onPick={setSide} />;
  }

  const team = side === "home" ? homeTeam : awayTeam;
  // An own goal is scored by a player of the *other* team.
  const playerSide: Side = kind === "OWN_GOAL" ? (side === "home" ? "away" : "home") : side;
  const playerTeam = playerSide === "home" ? homeTeam : awayTeam;

  return (
    <div>
      <ChosenTeam team={team} side={side} label="Goal for" onChange={() => { setSide(null); setShirt(null); setError(null); }} />
      <ErrorNote message={error} />
      <fieldset className="mb-4">
        <legend className="mb-2 text-base font-bold">Type</legend>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => { setKind(k.value); setShirt(null); }}
              className={`h-12 rounded-lg border-2 text-sm font-bold ${kind === k.value ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      <ShirtGrid
        side={playerSide}
        legend={kind === "OWN_GOAL" ? `Scorer (own goal by ${playerTeam.shortName}) — optional` : "Scorer — optional"}
        value={shirt}
        onChange={setShirt}
        statuses={playerStatuses(state, playerSide)}
        unavailable={(_, s) => (s?.sentOff ? "Sent off" : s?.subbedOff ? "Off" : null)}
        allowUnknown
        scope="onField"
      />
      <div className="sticky -bottom-4 -mx-4 mt-4 -mb-4 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ConfirmButton
          tone="go"
          label={`Confirm goal · ${team.shortName}`}
          onClick={() =>
            submit(() => operatorActions.recordEvent(state.matchId, { type: kind, side: playerSide, shirt }))
          }
        />
      </div>
    </div>
  );
}
