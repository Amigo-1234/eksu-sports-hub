/**
 * Live match alerts: compares the previous and next state of a match the
 * visitor is watching and turns what changed into short alerts (and the sound
 * each one may play). Pure — no DOM, audio or storage — so it is unit-tested.
 *
 * Nothing that was already on screen ever alerts: the server-rendered match is
 * the baseline, events are identified by id, and every alert has a stable key
 * the caller remembers, so reconnects, full resyncs and re-renders never replay.
 */
import type { MatchDetail, MatchEvent } from "../types.ts";

export type SoundKind = "goal" | "penalty" | "red" | "sub" | "ht" | "ft";

export interface LiveAlert {
  /** Stable identity (event id or status transition) used to never alert twice. */
  key: string;
  icon: string;
  title: string;
  /** "Downfall FC 2–1 School Gate United" */
  scoreLine: string | null;
  /** "Al Ameen — 67'" */
  detail: string | null;
  sound: SoundKind | null;
  /** Higher wins when several alerts arrive at once (only one sound plays). */
  priority: number;
}

const minuteOf = (e: Pick<MatchEvent, "minute" | "addedTime">) => (e.addedTime ? `${e.minute}+${e.addedTime}'` : `${e.minute}'`);

function who(e: MatchEvent): string | null {
  if (e.player.name) return e.player.name;
  return e.player.shirtNumber != null ? `No. ${e.player.shirtNumber}` : null;
}

function scoreLine(m: MatchDetail): string | null {
  if (!m.score) return null;
  return `${m.homeTeam.shortName} ${m.score.home}–${m.score.away} ${m.awayTeam.shortName}`;
}

function eventAlert(e: MatchEvent, m: MatchDetail): LiveAlert | null {
  const team = e.teamId === m.homeTeamId ? m.homeTeam : m.awayTeam;
  const player = who(e);
  const line = (x: string | null) => (x ? `${x} — ${minuteOf(e)}` : `${team.shortName} — ${minuteOf(e)}`);
  const base = { key: `event:${e.id}`, scoreLine: scoreLine(m) };
  switch (e.type) {
    case "GOAL":
      return { ...base, icon: "⚽", title: "GOAL!", detail: line(player), sound: "goal", priority: 100 };
    case "PENALTY_GOAL":
      return { ...base, icon: "⚽", title: "GOAL! Penalty scored", detail: line(player), sound: "goal", priority: 100 };
    case "OWN_GOAL":
      return { ...base, icon: "⚽", title: "GOAL! Own goal", detail: line(player ? `${player} (${team.shortName})` : null), sound: "goal", priority: 100 };
    case "PENALTY_AWARDED":
      return { ...base, icon: "🥅", title: `Penalty to ${team.shortName}`, detail: minuteOf(e), sound: "penalty", priority: 80 };
    case "PENALTY_MISS":
      return { ...base, icon: "❌", title: "Penalty missed", detail: line(player), sound: null, priority: 60 };
    case "PENALTY_SAVED":
      return { ...base, icon: "🧤", title: "Penalty saved", detail: line(player), sound: null, priority: 60 };
    case "RED_CARD":
    case "SECOND_YELLOW":
    case "EXCLUSION":
      return {
        ...base,
        icon: "🟥",
        title: e.type === "SECOND_YELLOW" ? "Red card (second yellow)" : "Red card",
        detail: line(player ? `${player} (${team.shortName})` : null),
        sound: "red",
        priority: 70,
      };
    case "YELLOW_CARD":
      return { ...base, icon: "🟨", title: "Yellow card", detail: line(player ? `${player} (${team.shortName})` : null), sound: null, priority: 30 };
    case "SUBSTITUTION": {
      const on = e.playerIn ? (e.playerIn.name ?? (e.playerIn.shirtNumber != null ? `No. ${e.playerIn.shirtNumber}` : null)) : null;
      const detail = player && on ? `${player} off, ${on} on — ${minuteOf(e)}` : line(null);
      return { ...base, icon: "🔄", title: `Substitution · ${team.shortName}`, detail, sound: "sub", priority: 20 };
    }
    case "INJURY":
      return { ...base, icon: "🚑", title: "Injury — play stopped", detail: line(player ? `${player} (${team.shortName})` : null), sound: null, priority: 25 };
    default:
      return null;
  }
}

function statusAlert(prev: MatchDetail, next: MatchDetail): LiveAlert | null {
  if (prev.status === next.status) return null;
  const s = scoreLine(next);
  switch (next.status) {
    case "LIVE_FIRST_HALF":
      return prev.status === "SCHEDULED" ? { key: "status:KICKOFF", icon: "🟢", title: "Kick-off!", scoreLine: s, detail: null, sound: null, priority: 40 } : null;
    case "HALF_TIME":
      return { key: "status:HALF_TIME", icon: "⏱️", title: "Half-time", scoreLine: s, detail: null, sound: "ht", priority: 50 };
    case "LIVE_SECOND_HALF":
      return prev.status === "HALF_TIME" ? { key: "status:SECOND_HALF", icon: "🟢", title: "Second half under way", scoreLine: s, detail: null, sound: null, priority: 40 } : null;
    case "FULL_TIME":
      return { key: "status:FULL_TIME", icon: "🏁", title: "Full-time", scoreLine: s, detail: null, sound: "ft", priority: 90 };
    default:
      return null;
  }
}

/** Alerts for what changed between two states of the same match, oldest first. */
export function detectAlerts(prev: MatchDetail, next: MatchDetail): LiveAlert[] {
  if (prev.id !== next.id) return [];
  const out: LiveAlert[] = [];
  const st = statusAlert(prev, next);
  const seen = new Set(prev.events.map((e) => e.id));
  for (const e of next.events) {
    if (seen.has(e.id)) continue;
    const a = eventAlert(e, next);
    if (a) out.push(a);
  }
  // A goal that disappeared (undone by the operator) lowers the score: say so, quietly.
  if (prev.score && next.score && next.score.home + next.score.away < prev.score.home + prev.score.away) {
    out.push({
      key: `correction:${next.seq ?? 0}`,
      icon: "↩️",
      title: "Score corrected",
      scoreLine: scoreLine(next),
      detail: "A goal was removed by the match official.",
      sound: null,
      priority: 10,
    });
  }
  if (st) {
    // Kick-off first, then events; half-time / full-time after the events that preceded them.
    if (st.key === "status:KICKOFF" || st.key === "status:SECOND_HALF") out.unshift(st);
    else out.push(st);
  }
  return out;
}

/** The one sound to play for a batch (at most one per update, the most important). */
export function soundFor(batch: LiveAlert[], enabled: (k: SoundKind) => boolean): SoundKind | null {
  let best: LiveAlert | null = null;
  for (const a of batch) if (a.sound && enabled(a.sound) && (!best || a.priority > best.priority)) best = a;
  return best?.sound ?? null;
}
