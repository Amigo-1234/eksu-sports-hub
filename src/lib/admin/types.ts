/** Admin read models (rows as the admin data layer returns them). */

export type MatchStatus = "SCHEDULED" | "1H" | "HT" | "2H" | "ET1" | "ET_BREAK" | "ET2" | "PENS" | "FT" | "POSTPONED" | "CANCELLED" | "ABANDONED";
export const LIVE_STATUSES: MatchStatus[] = ["1H", "HT", "2H", "ET1", "ET_BREAK", "ET2", "PENS"];
export type CompetitionStatus = "DRAFT" | "REGISTRATION" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type CompetitionFormat = "LEAGUE" | "KNOCKOUT" | "GROUPS" | "GROUPS_KNOCKOUT";
export type CompetitionKind = "OFFICIAL" | "FRIENDLY" | "TEST" | "DEMO";
export const STAGE_TYPES = ["LEAGUE", "GROUP", "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "THIRD_PLACE", "FINAL", "KNOCKOUT"] as const;
export type StageType = (typeof STAGE_TYPES)[number];
export const STAGE_TYPE_LABEL: Record<StageType, string> = {
  LEAGUE: "League",
  GROUP: "Group stage",
  ROUND_OF_32: "Round of 32",
  ROUND_OF_16: "Round of 16",
  QUARTER_FINAL: "Quarter-finals",
  SEMI_FINAL: "Semi-finals",
  THIRD_PLACE: "Third-place match",
  FINAL: "Final",
  KNOCKOUT: "Knockout round (custom name)",
};
export const isKnockoutStage = (t: StageType) => t !== "LEAGUE" && t !== "GROUP";
export type Category = "MEN" | "WOMEN" | "MIXED";
export type TeamKind = "FACULTY" | "DEPARTMENT" | "OTHER";
export type StaffRole = "ADMIN" | "MANAGER" | "OPERATOR";
export const STAFF_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "OPERATOR"];
export type Position = "GK" | "DF" | "MF" | "FW";
export const TIEBREAKERS = [
  "points",
  "goal_difference",
  "goals_for",
  "wins",
  "h2h_points",
  "h2h_goal_difference",
  "h2h_goals_for",
  "fair_play",
  "alphabetical",
] as const;
export type Tiebreaker = (typeof TIEBREAKERS)[number];

export interface Season {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  archived_at: string | null;
}

export interface Sport {
  id: string;
  code: string;
  name: string;
}

export interface Department {
  id: string;
  faculty_id: string;
  name: string;
  code: string;
  team_count: number;
}

export interface Faculty {
  id: string;
  name: string;
  code: string;
  departments: Department[];
  team_count: number;
}

export interface Venue {
  id: string;
  name: string;
  short_name: string;
  notes: string;
  match_count: number;
}

export interface CompetitionSummary {
  id: string;
  name: string;
  short_name: string;
  status: CompetitionStatus;
  format: CompetitionFormat;
  category: Category;
  season: { id: string; name: string };
  sport: { id: string; name: string };
  entry_count: number;
  stage_count: number;
  match_count: number;
}

export interface Stage {
  id: string;
  name: string;
  stage_order: number;
  has_table: boolean;
  groups: { id: string; name: string }[];
  stage_type: StageType;
  legs: number;
  extra_time_allowed: boolean | null;
  penalties_allowed: boolean | null;
  qualification: { per_group?: number; top?: number; best_ranked?: { rank: number; count: number } };
  status: "PENDING" | "ACTIVE" | "COMPLETED";
  locked_at: string | null;
}

export interface Entry {
  id: string;
  team: TeamRef;
  stage_id: string | null;
  group_id: string | null;
}

export interface CompetitionDetail {
  id: string;
  name: string;
  short_name: string;
  description: string;
  status: CompetitionStatus;
  format: CompetitionFormat;
  category: Category;
  season_id: string;
  sport_id: string;
  points_win: number;
  points_draw: number;
  points_loss: number;
  tiebreakers: Tiebreaker[];
  extra_time_enabled: boolean;
  penalties_enabled: boolean;
  allow_multi_team_players: boolean;
  kind: CompetitionKind;
  /** Half lengths in seconds (2700 / 900 = normal football). */
  half_seconds: number;
  et_half_seconds: number;
  stages: Stage[];
  entries: Entry[];
  match_count: number;
  /** Any match has kicked off (match length is then locked). */
  matches_started?: boolean;
}

export interface TeamRef {
  id: string;
  name: string;
  short_name: string;
  code: string;
}

export interface Team extends TeamRef {
  slug: string;
  kind: TeamKind;
  category: Category;
  active: boolean;
  faculty_id: string | null;
  department_id: string | null;
  sport_id: string;
  color_primary: string;
  color_secondary: string;
  faculty: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
}

export interface SquadPlayer {
  id: string;
  player_id: string;
  display_name: string | null;
  shirt_number: number;
  position: Position | null;
  is_captain: boolean;
}

export interface Squad {
  id: string;
  team_id: string;
  season: { id: string; name: string };
  players: SquadPlayer[];
}

export interface AssignmentRef {
  user_id: string;
  role: "PRIMARY" | "BACKUP";
  active: boolean;
  display_name?: string;
}

export interface MatchRow {
  id: string;
  status: MatchStatus;
  status_note: string | null;
  scheduled_at: string;
  round_label: string;
  home_score: number;
  away_score: number;
  competition: { id: string; short_name: string; name: string };
  stage: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  home: TeamRef;
  away: TeamRef;
  venue: { id: string; short_name: string } | null;
  assignments: AssignmentRef[];
}

export interface MatchFilters {
  date?: string;
  from?: string;
  to?: string;
  competition?: string;
  status?: string;
  team?: string;
  venue?: string;
  operator?: string; // user id | "none" | "no-primary"
}

export interface StaffMember {
  user_id: string;
  email: string;
  display_name: string;
  roles: StaffRole[];
  deactivated_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  active_assignments: number;
}

export interface StandingRow {
  team: TeamRef;
  group_id: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  rank: number;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  actor: { id: string; display_name: string } | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  match_id: string | null;
  before_state: unknown;
  after_state: unknown;
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  entity?: string;
  match?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface LiveMatch {
  match: {
    id: string;
    status: MatchStatus;
    home_score: number;
    away_score: number;
    current_period: number | null;
    period_started_at: string | null;
    period_ended_at: string | null;
    period_offset_seconds: number;
    /** Half length of the match in seconds (45:00 unless a short format). */
    half_seconds?: number | null;
    et_half_seconds?: number | null;
    clock_running: boolean;
    paused_at: string | null;
    accumulated_pause_seconds: number;
    stoppage_seconds: number;
    active_operator_id: string | null;
    server_now?: string;
  };
  scheduled_at: string;
  round_label: string;
  competition: string;
  home: string;
  home_code: string;
  away: string;
  away_code: string;
  venue: string | null;
  operator: string | null;
  last_event: { type: string; minute: number; minute_extra: number; recorded_at: string; voided: boolean } | null;
  last_activity_at: string | null;
}

/** Result every admin server action returns (forms render it). */
export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  /** Changes on every submission so forms can react to repeated results. */
  at?: number;
  /** Optional payload (e.g. a new record id, a one-time link). */
  data?: Record<string, string>;
} | null;

export interface CompetitionOption {
  id: string;
  name: string;
  short_name: string;
  status: CompetitionStatus;
  season: string;
  stages: { id: string; name: string; groups: { id: string; name: string }[] }[];
  teamIds: string[];
}
