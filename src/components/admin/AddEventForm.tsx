"use client";

import { useCallback, useState } from "react";
import { addEvent } from "@/lib/admin/actions/matches";
import type { ActionState } from "@/lib/admin/types";
import { ActionForm, Submit } from "./ActionForm";
import { btn, Field, inputCls, selectCls } from "./ui";

type SquadEntry = { player_id: string; shirt_number: number; name: string | null };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/** Adds a missing event through admin_add_event (score is re-derived). */
export function AddEventForm({
  matchId,
  eventTypes,
  home,
  away,
  squads,
  maxPeriod,
  halfSeconds = 45 * 60,
}: {
  matchId: string;
  eventTypes: { code: string; name: string; requires_player: boolean; requires_related_player: boolean }[];
  home: { id: string; name: string };
  away: { id: string; name: string };
  squads: { home: SquadEntry[]; away: SquadEntry[] };
  maxPeriod: number;
  /** Half length of this match in seconds (45:00 unless the competition uses a short format). */
  halfSeconds?: number;
}) {
  const [eventId, setEventId] = useState(newId);
  const [type, setType] = useState(eventTypes[0]?.code ?? "");
  const [team, setTeam] = useState(home.id);
  const [period, setPeriod] = useState(1);
  const et = eventTypes.find((e) => e.code === type);
  const squad = team === home.id ? squads.home : squads.away;
  const onDone = useCallback((s: NonNullable<ActionState>) => {
    if (s.ok) setEventId(newId());
  }, []);
  // Accepted minute labels follow the match's half length (normally 0–45 / 45–90).
  const lo = period === 1 ? 0 : Math.floor(halfSeconds / 60);
  const hi = period === 1 ? Math.ceil(halfSeconds / 60) : Math.ceil((2 * halfSeconds) / 60);
  const label = (p: SquadEntry) => `#${p.shirt_number}${p.name ? ` ${p.name}` : ""}`;

  return (
    <ActionForm action={addEvent} onDone={onDone} resetOnSuccess>
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="event_id" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Event">
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            {eventTypes.map((e) => (
              <option key={e.code} value={e.code}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={type === "OWN_GOAL" ? "Team of the player (own goal)" : "Team"}>
          <select name="team_id" value={team} onChange={(e) => setTeam(e.target.value)} className={selectCls}>
            <option value={home.id}>{home.name} (home)</option>
            <option value={away.id}>{away.name} (away)</option>
          </select>
        </Field>
        <Field label="Half">
          <select name="period" value={period} onChange={(e) => setPeriod(Number(e.target.value))} className={selectCls}>
            <option value={1}>1st half</option>
            {maxPeriod >= 2 && <option value={2}>2nd half</option>}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minute" hint={`${lo}–${hi}`}>
            <input type="number" name="minute" required min={lo} max={hi} className={inputCls} />
          </Field>
          <Field label="Added time" hint={`Only at ${hi}'`}>
            <input type="number" name="minute_extra" min={0} max={60} defaultValue={0} className={inputCls} />
          </Field>
        </div>
        <Field label={type === "SUBSTITUTION" ? "Player going off" : "Player"} hint={et?.requires_player ? "Required" : "Optional"}>
          <select name="player_id" required={et?.requires_player} defaultValue="" key={`${team}-p`} className={selectCls}>
            <option value="">{squad.length ? "Not specified" : "No squad registered"}</option>
            {squad.map((p) => (
              <option key={p.player_id} value={p.player_id}>
                {label(p)}
              </option>
            ))}
          </select>
        </Field>
        {et?.requires_related_player && (
          <Field label="Player coming on">
            <select name="related_player_id" required defaultValue="" key={`${team}-r`} className={selectCls}>
              <option value="">Choose player</option>
              {squad.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  {label(p)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Correction reason" hint="Recorded in the audit log." className="sm:col-span-2">
          <input name="reason" required maxLength={300} placeholder="e.g. Goal missed by operator; confirmed by referee report" className={inputCls} />
        </Field>
      </div>
      <Submit className={`${btn.primary} mt-3`} pendingLabel="Adding…">
        Add event
      </Submit>
    </ActionForm>
  );
}
