/**
 * Supabase row / RPC payload → public UI types. Pure and shared by the server
 * data source and the browser realtime layer.
 */
import type { ID, MatchEvent, MatchEventType, MatchStatus, PublicClock, PublicLineup } from "../../types";

/* eslint-disable @typescript-eslint/no-explicit-any -- RPC payloads are mapped explicitly below. */

const STATUS: Record<string, MatchStatus> = {
  SCHEDULED: "SCHEDULED",
  "1H": "LIVE_FIRST_HALF",
  HT: "HALF_TIME",
  "2H": "LIVE_SECOND_HALF",
  FT: "FULL_TIME",
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
  ABANDONED: "ABANDONED",
};
export const toPublicStatus = (s: string): MatchStatus => STATUS[s] ?? "SCHEDULED";

const EVENT: Record<string, MatchEventType> = {
  GOAL: "GOAL",
  PENALTY_GOAL: "PENALTY_GOAL",
  OWN_GOAL: "OWN_GOAL",
  PENALTY_MISS: "PENALTY_MISS",
  YELLOW_CARD: "YELLOW_CARD",
  SECOND_YELLOW: "RED_CARD", // shown as the resulting red card
  RED_CARD: "RED_CARD",
  SUBSTITUTION: "SUBSTITUTION",
};

/** Public clock fields → UI clock (the same maths as the operator console). */
export function toPublicClock(m: any): PublicClock | null {
  if (m.current_period == null) return null;
  return {
    period: m.current_period,
    periodStartedAt: m.period_started_at,
    periodEndedAt: m.period_ended_at,
    periodOffsetSeconds: m.period_offset_seconds ?? 0,
    clockRunning: Boolean(m.clock_running),
    pausedAt: m.paused_at,
    accumulatedPauseSeconds: Number(m.accumulated_pause_seconds ?? 0),
    stoppageSeconds: m.stoppage_seconds ?? 0,
  };
}

/** Feed event (public_match_feed) → UI event. Voided events are dropped by callers. */
export function toEvent(e: any, matchId: ID): MatchEvent {
  const type = EVENT[e.type] ?? "GOAL";
  return {
    id: e.id,
    matchId,
    type,
    teamId: e.team_id,
    minute: e.minute,
    addedTime: e.minute_extra || undefined,
    player: { shirtNumber: e.shirt_number ?? null, name: e.player_name ?? undefined },
    ...(type === "SUBSTITUTION"
      ? { playerIn: { shirtNumber: e.related_shirt_number ?? null, name: e.related_player_name ?? undefined } }
      : {}),
    seq: Number(e.seq),
  };
}


/** Chronological order for the timeline (admin-added events can arrive late). */
export function sortEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort(
    (a, b) => a.minute - b.minute || (a.addedTime ?? 0) - (b.addedTime ?? 0) || (a.seq ?? 0) - (b.seq ?? 0),
  );
}

const num = (v: any): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/** Feed line-ups (public_match_feed.lineups) → UI line-ups. Only public-safe fields exist in the payload. */
export function toLineups(raw: any): PublicLineup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l: any) => ({
    teamId: l.team_id,
    formation: l.formation ?? null,
    players: (Array.isArray(l.players) ? l.players : []).map((p: any) => ({
      shirtNumber: Number(p.shirt_number),
      name: p.name ?? null,
      role: p.role === "STARTER" ? "STARTER" : "SUBSTITUTE",
      position: p.position ?? null,
      x: num(p.x),
      y: num(p.y),
      captain: !!p.captain,
      goalkeeper: !!p.goalkeeper,
      onField: !!p.on_field,
      subbedOn: !!p.subbed_on,
      subbedOff: !!p.subbed_off,
      onMinute: num(p.on_minute),
      onExtra: num(p.on_extra),
      offMinute: num(p.off_minute),
      offExtra: num(p.off_extra),
      sentOff: !!p.sent_off,
      booked: !!p.booked,
      goals: Number(p.goals ?? 0),
    })),
  }));
}
