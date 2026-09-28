"use client";

import { useState } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { playerStatuses } from "@/lib/operator/engine";
import type { AssignmentSeed, OpEventType, OpMatchState, Side } from "@/lib/operator/types";
import { CardGlyph } from "../CardGlyph";
import { ChosenTeam, ConfirmButton, ErrorNote, ShirtGrid, TeamPicker } from "../pickers";
import { useSubmit } from "./useSubmit";

type CardType = Extract<OpEventType, "YELLOW_CARD" | "SECOND_YELLOW" | "RED_CARD">;

const CARDS: { value: CardType; glyph: "YELLOW" | "SECOND_YELLOW" | "RED"; label: string; cls: string }[] = [
  { value: "YELLOW_CARD", glyph: "YELLOW", label: "Yellow", cls: "border-accent-500 bg-accent-100" },
  { value: "SECOND_YELLOW", glyph: "SECOND_YELLOW", label: "2nd yellow", cls: "border-accent-500 bg-accent-100" },
  { value: "RED_CARD", glyph: "RED", label: "Red", cls: "border-live bg-live-soft" },
];

/** CARD → team → shirt → card type → confirm. */
export function CardFlow({
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
  const [card, setCard] = useState<CardType | null>(null);
  const { submit, error, setError } = useSubmit((r) =>
    onDone(r.eventId!, `${CARDS.find((c) => c.value === card)!.label} card · No. ${shirt}`),
  );

  if (!side) return <TeamPicker home={homeTeam} away={awayTeam} prompt="Card for which team?" onPick={setSide} />;

  const team = side === "home" ? homeTeam : awayTeam;
  const statuses = playerStatuses(state, side);
  const player = shirt !== null ? statuses.get(shirt) : undefined;
  const cardAllowed = (c: CardType) =>
    shirt !== null && (c === "SECOND_YELLOW" ? !!player?.yellow : c === "YELLOW_CARD" ? !player?.yellow : true);

  return (
    <div>
      <ChosenTeam team={team} side={side} label="Card" onChange={() => { setSide(null); setShirt(null); setCard(null); setError(null); }} />
      <ErrorNote message={error} />
      <ShirtGrid
        side={side}
        legend="1. Player"
        value={shirt}
        onChange={(n) => { setShirt(n); setCard(null); }}
        statuses={statuses}
        unavailable={(_, s) => (s?.sentOff ? "Sent off" : s?.subbedOff ? "Off" : null)}
      />
      <fieldset className="mt-4">
        <legend className="mb-2 text-base font-bold">2. Card</legend>
        <div className="grid grid-cols-3 gap-2">
          {CARDS.map((c) => {
            const selected = card === c.value;
            return (
              <button
                key={c.value}
                type="button"
                disabled={!cardAllowed(c.value)}
                aria-pressed={selected}
                onClick={() => setCard(c.value)}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-[3px] px-1 text-sm font-extrabold uppercase disabled:opacity-35 ${
                  selected ? `${c.cls} ring-4 ring-ink` : "border-line-strong bg-surface"
                }`}
              >
                <CardGlyph kind={c.glyph} />
                {c.label}
                {selected && <span className="text-[10px]">✓ Selected</span>}
              </button>
            );
          })}
        </div>
        {shirt !== null && player?.yellow && (
          <p className="mt-2 text-xs font-semibold text-ink-muted">No. {shirt} is already booked — a further caution is a second yellow.</p>
        )}
      </fieldset>
      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-surface px-4 pt-3">
        <ConfirmButton
          tone={card === "YELLOW_CARD" ? "ink" : "danger"}
          disabled={shirt === null || card === null}
          label={
            shirt === null ? "Choose a player" :
            card === null ? "Choose a card" :
            `Confirm ${CARDS.find((c) => c.value === card)!.label} · No. ${shirt}`
          }
          onClick={() =>
            submit(() => operatorActions.recordEvent(state.matchId, { type: card!, side, shirt }))
          }
        />
      </div>
    </div>
  );
}
