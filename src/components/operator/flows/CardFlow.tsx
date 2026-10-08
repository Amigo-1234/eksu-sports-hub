"use client";

import { useState } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { playerStatuses } from "@/lib/operator/engine";
import type { AssignmentSeed, OpEventType, OpMatchState, Side } from "@/lib/operator/types";
import { hasPlayerRules } from "@/lib/rules/special";
import { CardGlyph } from "../CardGlyph";
import { ChosenTeam, ConfirmButton, ErrorNote, ShirtGrid, TeamPicker } from "../pickers";
import { useSubmit } from "./useSubmit";

type CardType = Extract<OpEventType, "YELLOW_CARD" | "SECOND_YELLOW" | "RED_CARD" | "EXCLUSION">;

const CARDS: { value: CardType; glyph: "YELLOW" | "SECOND_YELLOW" | "RED"; label: string; cls: string }[] = [
  { value: "YELLOW_CARD", glyph: "YELLOW", label: "Yellow", cls: "border-accent-500 bg-accent-100" },
  { value: "SECOND_YELLOW", glyph: "SECOND_YELLOW", label: "2nd yellow", cls: "border-accent-500 bg-accent-100" },
  { value: "RED_CARD", glyph: "RED", label: "Red", cls: "border-live bg-live-soft" },
];

/** CARD → team → shirt → card type → confirm. Special rules add a temporary red and an explicit exclusion. */
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
  const [reason, setReason] = useState("");
  const special = hasPlayerRules(state.rules);
  const secs = state.rules?.redCardSuspensionSeconds ?? null;
  const labelOf = (c: CardType) => (c === "EXCLUSION" ? "Exclusion" : CARDS.find((x) => x.value === c)!.label);
  const { submit, error, setError } = useSubmit((r) =>
    onDone(r.eventId!, card === "EXCLUSION" ? `No. ${shirt} excluded from the match` : `${labelOf(card!)} card · No. ${shirt}${secs && card !== "YELLOW_CARD" ? ` · ${secs} s suspension` : ""}`),
  );

  if (!side) return <TeamPicker home={homeTeam} away={awayTeam} prompt="Card for which team?" onPick={setSide} />;

  const team = side === "home" ? homeTeam : awayTeam;
  const statuses = playerStatuses(state, side);
  const player = shirt !== null ? statuses.get(shirt) : undefined;
  const offPitch = special && player?.lastMove === "OFF";
  const cardAllowed = (c: CardType) =>
    shirt !== null &&
    (c === "EXCLUSION" ? true
      : c === "SECOND_YELLOW" ? !!player?.yellow && !offPitch
      : c === "YELLOW_CARD" ? !player?.yellow
      : !offPitch);
  const options = special
    ? [...CARDS.map((c) => (secs && c.value !== "YELLOW_CARD" ? { ...c, label: `${c.label} · ${secs} s` } : c)),
       { value: "EXCLUSION" as const, glyph: "RED" as const, label: "Exclude", cls: "border-ink bg-ink/10" }]
    : CARDS;
  const ready = shirt !== null && card !== null && (card !== "EXCLUSION" || reason.trim().length >= 3);

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
        unavailable={(_, s) => (special ? (s?.sentOff ? "Excluded" : null) : s?.sentOff ? "Sent off" : s?.subbedOff ? "Off" : null)}
      />
      <fieldset className="mt-4">
        <legend className="mb-2 text-base font-bold">2. Card</legend>
        <div className={`grid gap-2 ${special ? "grid-cols-2 min-[420px]:grid-cols-4" : "grid-cols-3"}`}>
          {options.map((c) => {
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
                {c.value === "EXCLUSION" ? (
                  <span className="grid h-9 w-9 place-items-center rounded bg-live text-xs font-black text-white" aria-hidden="true">EX</span>
                ) : (
                  <CardGlyph kind={c.glyph} />
                )}
                {c.label}
                {selected && <span className="text-[10px]">✓ Selected</span>}
              </button>
            );
          })}
        </div>
        {shirt !== null && player?.yellow && (
          <p className="mt-2 text-xs font-semibold text-ink-muted">No. {shirt} is already booked — a further caution is a second yellow.</p>
        )}
        {secs && card !== "EXCLUSION" && (
          <p className="mt-2 text-xs font-semibold text-ink-muted">
            A red card or second yellow is a {secs}-second suspension of active play (half-time and stoppages don&apos;t count). The team plays a
            player short; the player returns only when you approve it.
          </p>
        )}
        {card === "EXCLUSION" && (
          <div className="mt-3 rounded-xl border-2 border-live bg-live-soft p-3">
            <p className="text-sm font-extrabold text-live">Permanent: No. {shirt} cannot return to this match. This is audited.</p>
            <label className="mt-2 block text-sm font-bold" htmlFor="exclusion-reason">Referee&apos;s reason</label>
            <input
              id="exclusion-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="e.g. Repeated abusive language"
              className="mt-1 h-12 w-full rounded-lg border-2 border-line-strong bg-surface px-3 text-base"
            />
          </div>
        )}
      </fieldset>
      <div className="sticky -bottom-4 -mx-4 mt-4 -mb-4 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ConfirmButton
          tone={card === "YELLOW_CARD" ? "ink" : "danger"}
          disabled={!ready}
          label={
            shirt === null ? "Choose a player" :
            card === null ? "Choose a card" :
            card === "EXCLUSION" ? (reason.trim().length < 3 ? "Give the reason" : `Exclude No. ${shirt} permanently`) :
            `Confirm ${labelOf(card)} · No. ${shirt}`
          }
          onClick={() =>
            submit(() =>
              operatorActions.recordEvent(state.matchId, {
                type: card!,
                side,
                shirt,
                ...(card === "EXCLUSION" ? { reason: reason.trim() } : {}),
              }),
            )
          }
        />
      </div>
    </div>
  );
}
