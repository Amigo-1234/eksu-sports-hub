/**
 * Domain model for EKSU Sports Hub.
 *
 * These types describe what the UI consumes. They are deliberately shaped so a
 * Supabase-backed data source can return the same objects (rows + joins)
 * without the UI changing. All IDs are stable strings.
 */

export type ID = string;

/** ISO-8601 timestamp string (UTC), e.g. "2026-09-28T15:00:00.000Z". */
export type ISODateTime = string;

export type SportStatus = "active" | "coming_soon";

export interface Sport {
  id: ID;
  name: string;
  slug: string;
  status: SportStatus;
}

export type CompetitionFormat = "league" | "knockout";

export type CompetitionCategory = "men" | "women" | "mixed";

export interface Competition {
  id: ID;
  sportId: ID;
  name: string;
  /** Short label used in dense lists, e.g. "Inter-Faculty". */
  shortName: string;
  season: string;
  format: CompetitionFormat;
  /** Set only for short formats: length of each half in seconds (e.g. 450 = 7:30). */
  halfSeconds?: number;
  category: CompetitionCategory;
  description: string;
  /** Team IDs participating in the competition. */
  teamIds: ID[];
}

export type TeamKind = "faculty" | "department";

export interface Team {
  id: ID;
  name: string;
  /** Medium-length label for lists, e.g. "Engineering". */
  shortName: string;
  /** 2–4 letter code used on crests and in narrow tables. */
  code: string;
  kind: TeamKind;
  category: CompetitionCategory;
  /** Crest colours. Hex strings. `primary` is the crest fill. */
  colors: { primary: string; secondary: string };
}

/**
 * Public-facing match status. The backend is expected to run a simpler clock
 * state machine (see `MatchPhase` in `status.ts`); `toMatchStatus()` maps it.
 */
export type MatchStatus =
  | "SCHEDULED"
  | "LIVE_FIRST_HALF"
  | "HALF_TIME"
  | "LIVE_SECOND_HALF"
  | "FULL_TIME"
  | "POSTPONED"
  | "CANCELLED"
  | "ABANDONED";

export interface Score {
  home: number;
  away: number;
}

export interface Venue {
  id: ID;
  name: string;
  shortName: string;
}

export interface Match {
  id: ID;
  competitionId: ID;
  homeTeamId: ID;
  awayTeamId: ID;
  venueId: ID;
  /** Scheduled kick-off. */
  kickoffAt: ISODateTime;
  status: MatchStatus;
  /** Null until the match has kicked off. */
  score: Score | null;
  /** Human round label, e.g. "Matchday 5" or "Semi-final". */
  round: string;
  /**
   * Wall-clock time the current period started (first or second half).
   * Used to derive the running minute on live matches. Null otherwise.
   */
  periodStartedAt: ISODateTime | null;
  /** Explanation for postponed / cancelled / abandoned matches. */
  statusNote?: string;
  /** Minute play stopped, for abandoned matches. */
  abandonedMinute?: number;
  /** Server change counter (real data only) — realtime clients compare against it. */
  seq?: number;
  /**
   * Authoritative clock fields (real data only). When present the minute is
   * derived from these (pauses, offsets) rather than from `periodStartedAt`.
   */
  clock?: PublicClock | null;
}

/** The server's clock state for the current period (all times ISO). */
export interface PublicClock {
  period: number | null;
  periodStartedAt: ISODateTime | null;
  periodEndedAt: ISODateTime | null;
  periodOffsetSeconds: number;
  clockRunning: boolean;
  pausedAt: ISODateTime | null;
  accumulatedPauseSeconds: number;
  stoppageSeconds: number;
  /** Half lengths of this match in seconds (45:00 / 15:00 unless the competition sets a short format). */
  halfSeconds?: number;
  etHalfSeconds?: number;
}

export type MatchEventType =
  | "GOAL"
  | "OWN_GOAL"
  | "PENALTY_GOAL"
  | "PENALTY_MISS"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "SUBSTITUTION";

/**
 * Player reference. Demo data only carries shirt numbers — no names — so we
 * never invent identities for real students.
 */
export interface PlayerRef {
  /** Null when the operator recorded the event without a player. */
  shirtNumber: number | null;
  name?: string;
}

export interface MatchEvent {
  id: ID;
  matchId: ID;
  type: MatchEventType;
  /** Team of the player involved (for OWN_GOAL, the player's own team). */
  teamId: ID;
  minute: number;
  /** Stoppage-time minutes, e.g. 45+2 → minute 45, addedTime 2. */
  addedTime?: number;
  player: PlayerRef;
  /** SUBSTITUTION: player coming on. `player` is the one going off. */
  playerIn?: PlayerRef;
  /** Server order (real data only). */
  seq?: number;
  /** 1–2 when known (real data): which half the event belongs to. */
  period?: number;
}

export interface FormResult {
  matchId: ID;
  outcome: "W" | "D" | "L";
}

export interface Standing {
  competitionId: ID;
  teamId: ID;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Most recent last. */
  form: FormResult[];
}

/* ------------------------------------------------------------------------ */
/* View models: joined shapes returned by the data layer.                    */
/* ------------------------------------------------------------------------ */

export interface MatchSummary extends Match {
  homeTeam: Team;
  awayTeam: Team;
  competition: Competition;
  venue: Venue;
}

export interface MatchDetail extends MatchSummary {
  /** Chronological. Empty array when no events are recorded. */
  events: MatchEvent[];
  /**
   * Confirmed (published) line-ups, home first. Undefined when the data
   * source does not provide line-ups (demo data); empty when none are
   * published yet.
   */
  lineups?: PublicLineup[];
  /**
   * DEMO SHOWCASE match (real data only): demonstration data for presenting
   * the platform. Never an official result; always labelled as such.
   */
  isDemo?: boolean;
  /** Match statistics. Only DEMO SHOWCASE matches carry (demonstration) stats. */
  stats?: MatchStats | null;
}

export interface TeamMatchStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface MatchStats {
  /** True for demonstration statistics (not officially collected). */
  demo: boolean;
  note: string;
  home: TeamMatchStats;
  away: TeamMatchStats;
}

/** A published team sheet. Public-safe: display name, shirt, position only. */
export interface PublicLineup {
  teamId: ID;
  formation: string | null;
  /** DEMO SHOWCASE team sheet (demonstration only, not an official line-up). */
  demo?: boolean;
  players: PublicLineupPlayer[];
}

export interface PublicLineupPlayer {
  shirtNumber: number;
  name: string | null;
  role: "STARTER" | "SUBSTITUTE";
  position: string | null;
  /** Normalised pitch coordinates (0–100, attacking upwards); starters only. */
  x: number | null;
  y: number | null;
  captain: boolean;
  goalkeeper: boolean;
  /** Derived by the server from the line-up + non-voided events. */
  onField: boolean;
  subbedOn: boolean;
  subbedOff: boolean;
  onMinute: number | null;
  onExtra: number | null;
  offMinute: number | null;
  offExtra: number | null;
  sentOff: boolean;
  booked: boolean;
  goals: number;
}

export interface StandingRow extends Standing {
  team: Team;
}
