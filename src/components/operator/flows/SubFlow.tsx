"use client";

import { useState } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { playerStatuses } from "@/lib/operator/engine";
import type { AssignmentSeed, OpMatchState, Side } from "@/lib/operator/types";
import { ChosenTeam, ConfirmButton, ErrorNote, ShirtGrid, TeamPicker } from "../pickers";
import { useSubmit } from "./useSubmit";

/** SUBSTITUTION → team → player OFF → player ON → confirm. */
export function SubFlow({
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
  const [off, setOff] = useState<number | null>(null);
  const [on, setOn] = useState<number | null>(null);
  const { submit, error, setError } = useSubmit((r) => onDone(r.eventId!, `Sub · No. ${on} on, No. ${off} off`));

  if (!side) return <TeamPicker home={homeTeam} away={awayTeam} prompt="Substitution for which team?" onPick={setSide} />;

  const team = side === "home" ? homeTeam : awayTeam;
  const statuses = playerStatuses(state, side);
  const reset = () => { setSide(null); setOff(null); setOn(null); setError(null); };

  return (
    <div>
      <ChosenTeam team={team} side={side} label="Substitution" onChange={reset} />
      <ErrorNote message={error} />

      <div className="mb-4 grid grid-cols-2 gap-2" aria-live="polite">
        <button
          type="button"
          onClick={() => { setOff(null); setOn(null); }}
          className={`rounded-xl border-[3px] px-3 py-2 text-left ${off !== null ? "border-loss bg-loss/10" : "border-dashed border-line-strong"}`}
        >
          <span className="block text-xs font-extrabold tracking-widest text-loss uppercase">↓ Off</span>
          <span className="font-display text-2xl font-extrabold">{off !== null ? `No. ${off}` : "—"}</span>
        </button>
        <button
          type="button"
          disabled={off === null}
          onClick={() => setOn(null)}
          className={`rounded-xl border-[3px] px-3 py-2 text-left ${on !== null ? "border-win bg-win/10" : "border-dashed border-line-strong"}`}
        >
          <span className="block text-xs font-extrabold tracking-widest text-win uppercase">↑ On</span>
          <span className="font-display text-2xl font-extrabold">{on !== null ? `No. ${on}` : "—"}</span>
        </button>
      </div>

      {off === null ? (
        <ShirtGrid
          side={side}
          legend="↓ Player coming OFF"
          tone="off"
          value={off}
          onChange={setOff}
          statuses={statuses}
          unavailable={(_, s) => (s?.sentOff ? "Sent off" : s?.subbedOff ? "Off" : null)}
        />
      ) : (
        <ShirtGrid
          side={side}
          legend="↑ Player coming ON"
          tone="on"
          value={on}
          onChange={setOn}
          statuses={statuses}
          unavailable={(n, s) => (n === off ? "Going off" : s?.subbedOff || s?.sentOff ? "Used" : s?.subbedOn ? "On" : null)}
        />
      )}

      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-surface px-4 pt-3">
        <ConfirmButton
          disabled={off === null || on === null}
          label={off === null ? "Choose player off" : on === null ? "Choose player on" : `Confirm: ${on} on · ${off} off`}
          onClick={() =>
            submit(() => operatorActions.recordEvent(state.matchId, { type: "SUBSTITUTION", side, shirt: off, shirtIn: on }))
          }
        />
      </div>
    </div>
  );
}
