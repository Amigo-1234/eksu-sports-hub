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
    | "OPERATOR_TAKEOVER";
  detail?: string;
}

export interface OpMatchState {
  matchId: string;
  phase: OpPhase;
  clock: ClockState;
  events: OpEvent[];
  log: OpLogEntry[];
  /** Bumped on every change; lets the store detect stale writes. */
  version: number;
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
