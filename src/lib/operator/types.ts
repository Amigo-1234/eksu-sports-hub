/**
 * Operator console domain model.
 *
 * Separate from the public model on purpose: the operator works with a
 * match *state* (phase + clock + event log) that the backend will own; the
 * public app only ever sees the derived `MatchStatus`/score/events.
 */
import type { MatchDetail } from "../types.ts";
import type { ClockState } from "./clock.ts";

export type Side = "home" | "away";

export type OpPhase =
  | "SCHEDULED"
  | "FIRST_HALF"
  | "HALF_TIME"
  | "SECOND_HALF"
  /** Knockout only: break before extra time (clock.period 2) or between ET halves (clock.period 3). */
  | "ET_BREAK"
  | "EXTRA_TIME_FIRST"
  | "EXTRA_TIME_SECOND"
  /** Penalty shoot-out (no running clock). */
  | "PENALTIES"
  | "FULL_TIME"
  | "POSTPONED"
  | "CANCELLED"
  | "ABANDONED";

export type OpEventType =
  | "GOAL"
  | "PENALTY_GOAL"
  | "OWN_GOAL"
  | "YELLOW_CARD"
  | "SECOND_YELLOW"
  | "RED_CARD"
  | "SUBSTITUTION"
  /** Recorded by the backend model; never changes the score. */
  | "PENALTY_MISS";

/** Network/sync state of an event, mirrored from its intent. */
export type SyncState = "PENDING" | "SENDING" | "CONFIRMED" | "FAILED";

export interface OpEvent {
  id: string;
  matchId: string;
  type: OpEventType;
  /** Team of the player involved (own goal: the player's own team). */
  side: Side;
  /** Minute at recording time, football convention (45+2 → 45, 2). */
  minute: number;
  addedTime: number;
  /** Demo shirt number; null when the operator skipped it. */
  shirt: number | null;
  /** SUBSTITUTION: player coming on. `shirt` is the player going off. */
  shirtIn?: number | null;
  recordedAt: number;
  /** Set when the event is undone or corrected. Events are never deleted. */
  voided: { at: number; reason: string } | null;
  /** Intent that carries this event to the server (null once server-confirmed). */
  intentId: string | null;
  /** Server-assigned order (absent until confirmed). */
  seq?: number;
}

export type PauseReason = "INJURY" | "WEATHER" | "CROWD" | "TECHNICAL" | "OTHER";

/** Non-event history: period changes, pauses, stoppage, corrections. */
export interface OpLogEntry {
  id: string;
  at: number;
  kind:
    | "MATCH_STARTED"
    | "PERIOD_ENDED"
    | "PERIOD_STARTED"
    | "MATCH_FINALISED"
    | "PAUSED"
    | "RESUMED"
    | "STOPPAGE_SET"
    | "EVENT_VOIDED"
    | "OPERATOR_TAKEOVER"
    | "SHOOTOUT_STARTED"
    | "SHOOTOUT_KICK"
    | "SHOOTOUT_KICK_VOIDED";
  detail?: string;
}

/** What the match's stage allows when the score is level (server-provided). */
export interface MatchRules {
  /** Knockout match: a level score is not a final result. */
  needsWinner: boolean;
  extraTime: boolean;
  penalties: boolean;
}

export type KickOutcome = "SCORED" | "MISSED" | "SAVED";

/** One penalty shoot-out kick. Never a match event: it cannot change the score. */
export interface OpKick {
  id: string;
  side: Side;
  shirt: number | null;
  outcome: KickOutcome;
  voided: { at: number; reason: string } | null;
  intentId: string | null;
  seq?: number;
}

export interface OpMatchState {
  matchId: string;
  phase: OpPhase;
  clock: ClockState;
  events: OpEvent[];
  log: OpLogEntry[];
  /** Bumped on every change; lets the store detect stale writes. */
  version: number;
  /** Level-score rules for this match (absent: league rules — a draw is final). */
  rules?: MatchRules;
  /** Penalty shoot-out kicks (empty/absent until a shoot-out starts). */
  kicks?: OpKick[];
}

export type AssignmentRole = "PRIMARY" | "BACKUP";

export interface PrepChecks {
  atVenue: boolean;
  teamsPresent: boolean;
  officialsReady: boolean;
}

export interface Operator {
  id: string;
  displayName: string;
  /** Role codes, e.g. ["OPERATOR"]. */
  roles: string[];
}

export interface Assignment {
  matchId: string;
  operatorId: string;
  role: AssignmentRole;
  /** Server-side prep status at page load; local checks override. */
  prep: PrepChecks;
}

export interface SquadMember {
  playerId: string;
  shirt: number;
  name?: string | null;
}

/** A team's match line-up as the console sees it (names + shirts + roles). */
export interface OpLineup {
  status: "DRAFT" | "CONFIRMED";
  formation: string | null;
  /** Why it cannot be confirmed / used for kick-off (empty when fine). */
  problems: string[];
  /** DEMO/TEST match: a test line-up prepared by an admin (not an official team sheet). */
  demo?: boolean;
  players: {
    playerId: string;
    shirt: number;
    name: string | null;
    role: "STARTER" | "SUBSTITUTE";
    position: string | null;
    captain: boolean;
    goalkeeper: boolean;
  }[];
}

/** Everything the console needs for one assigned match (serialisable). */
export interface AssignmentSeed {
  assignment: Assignment;
  match: MatchDetail;
  /** Supabase backend: authoritative state at page load. */
  canonical?: OpMatchState;
  /** Supabase backend: whether this user currently controls the match. */
  inControl?: boolean;
  /**
   * Supabase backend: shirt ↔ player for event recording — the confirmed
   * line-up when there is one, else the active squad. Mock uses demo shirts.
   */
  squads?: { home: SquadMember[]; away: SquadMember[] };
  /** Supabase backend: each team's line-up (null: not prepared). */
  lineups?: { home: OpLineup | null; away: OpLineup | null };
  /** Supabase backend: ADMIN emergency override allowing kick-off without line-ups. */
  lineupOverride?: string | null;
  /** Supabase backend: may this operator manage line-ups now (in control, or PRIMARY while nobody took control)? */
  lineupControl?: boolean;
}
