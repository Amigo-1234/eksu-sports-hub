/**
 * Canonical (server) match state → operator state. Pure; shared by the
 * server data layer and the client reconciler.
 */
import { initialClock, type ClockState } from "./clock.ts";
import type { OpEvent, OpEventType, OpLogEntry, OpMatchState, OpPhase } from "./types.ts";

/** Shape returned by the match RPCs (see supabase/migrations/*_match_rpc.sql). */
export interface CanonicalMatch {
  id: string;
  status: "SCHEDULED" | "1H" | "HT" | "2H" | "FT" | "POSTPONED" | "CANCELLED" | "ABANDONED";
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  seq: number;
  current_period: number | null;
  period_started_at: string | null;
  period_ended_at: string | null;
  period_offset_seconds: number;
  clock_running: boolean;
  paused_at: string | null;
  accumulated_pause_seconds: number | string;
  stoppage_seconds: number;
  active_operator_id?: string | null;
}

export interface CanonicalEvent {
  id: string;
  seq: number;
  type: string;
  period: number;
  minute: number;
  minute_extra: number;
  team_id: string;
  player_id: string | null;
  related_player_id: string | null;
  shirt_number?: number | null;
  related_shirt_number?: number | null;
  recorded_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface CanonicalLog {
  id: string;
  at: string;
  action: string;
  detail: unknown;
}

export interface CanonicalSquadPlayer {
  player_id: string;
  shirt_number: number;
  name?: string | null;
}

export interface CanonicalLineup {
  status: "DRAFT" | "CONFIRMED";
  formation: string | null;
  problems: string[];
  demo?: boolean;
  players: {
    player_id: string;
    name: string | null;
    shirt_number: number;
    role: "STARTER" | "SUBSTITUTE";
    position: string | null;
    captain: boolean;
    goalkeeper: boolean;
  }[];
}

export interface CanonicalState {
  match: CanonicalMatch;
  events: CanonicalEvent[];
  log?: CanonicalLog[];
  server_time?: string;
  replayed?: boolean;
  in_control?: boolean;
  squads?: { home: CanonicalSquadPlayer[]; away: CanonicalSquadPlayer[] };
  lineups?: { home: CanonicalLineup | null; away: CanonicalLineup | null };
  lineup_override?: string | null;
  lineup_control?: boolean;
}

const PHASE: Record<CanonicalMatch["status"], OpPhase> = {
  SCHEDULED: "SCHEDULED",
  "1H": "FIRST_HALF",
  HT: "HALF_TIME",
  "2H": "SECOND_HALF",
  FT: "FULL_TIME",
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
  ABANDONED: "ABANDONED",
};

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);

const LOG_KINDS = new Set<OpLogEntry["kind"]>([
  "MATCH_STARTED", "PERIOD_ENDED", "PERIOD_STARTED", "MATCH_FINALISED",
  "PAUSED", "RESUMED", "STOPPAGE_SET", "OPERATOR_TAKEOVER",
]);

export function clockFromCanonical(m: CanonicalMatch): ClockState {
  if (m.current_period === null) return initialClock();
  return {
    period: m.current_period === 2 ? 2 : 1,
    periodOffsetSeconds: m.period_offset_seconds,
    periodStartedAt: ms(m.period_started_at),
    periodEndedAt: ms(m.period_ended_at),
    clockRunning: m.clock_running,
    pausedAt: ms(m.paused_at),
    accumulatedPauseSeconds: Number(m.accumulated_pause_seconds),
    stoppageSeconds: m.stoppage_seconds,
  };
}

export function fromCanonical(c: CanonicalState): OpMatchState {
  const { match: m } = c;
  const events: OpEvent[] = c.events.map((e) => ({
    id: e.id,
    matchId: m.id,
    type: e.type as OpEventType,
    side: e.team_id === m.home_team_id ? "home" : "away",
    minute: e.minute,
    addedTime: e.minute_extra,
    shirt: e.shirt_number ?? null,
    ...(e.type === "SUBSTITUTION" ? { shirtIn: e.related_shirt_number ?? null } : {}),
    recordedAt: Date.parse(e.recorded_at),
    voided: e.voided_at ? { at: Date.parse(e.voided_at), reason: e.void_reason ?? "" } : null,
    intentId: null,
    seq: e.seq,
  }));
  const log: OpLogEntry[] = (c.log ?? [])
    .filter((l) => LOG_KINDS.has(l.action as OpLogEntry["kind"]))
    .map((l) => ({
      id: l.id,
      at: Date.parse(l.at),
      kind: l.action as OpLogEntry["kind"],
      ...(typeof l.detail === "string" ? { detail: l.detail } : {}),
    }));
  return { matchId: m.id, phase: PHASE[m.status], clock: clockFromCanonical(m), events, log, version: m.seq };
}
