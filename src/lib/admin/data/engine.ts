import "server-only";
import type { StageType } from "../types";
import { adminDb, must } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- the overview RPC payload is typed below. */

/**
 * Competition control centre (admin_competition_overview): the public
 * competition payload plus operational state. Everything here is derived in
 * Postgres; the UI never computes standings, qualification or honours.
 */

export type Qualification = "QUALIFIED" | "ELIMINATED" | "PENDING" | null;

export interface TableRow {
  team_id: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  fair_play_points: number;
  qualification: Qualification;
  tied: boolean;
}

export interface TieView {
  id: string;
  code: string;
  position: number;
  stage_id: string;
  home_label: string;
  away_label: string;
  home_team_id: string | null;
  away_team_id: string | null;
  match_id: string | null;
  scheduled_at: string | null;
  venue_id: string | null;
  winner_team_id: string | null;
  loser_team_id: string | null;
  decided_by: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | "ADMIN" | null;
  needs_reconciliation: boolean;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
  winner_to: { tie_id: string; code: string; side: "HOME" | "AWAY" } | null;
  loser_to: { tie_id: string; code: string; side: "HOME" | "AWAY" } | null;
}

export interface StageView {
  id: string;
  name: string;
  stage_type: StageType;
  order: number;
  has_table: boolean;
  is_knockout: boolean;
  status: "PENDING" | "ACTIVE" | "COMPLETED";
  legs: number;
  locked: boolean;
  qualification: { per_group?: number; top?: number; best_ranked?: { rank: number; count: number } };
  extra_time: boolean;
  penalties: boolean;
  groups: { id: string | null; name: string | null; complete: boolean; rows: TableRow[] }[] | null;
  ties: TieView[] | null;
}

export interface StageOps {
  stage_id: string;
  locked: boolean;
  matches: { total: number; finished: number; scheduled: number; postponed: number; live: number; cancelled: number; abandoned: number };
  generation: { id: string; kind: "ROUND_ROBIN" | "KNOCKOUT"; created_at: string; match_count: number; config: Record<string, unknown> } | null;
  pending_qualification: number;
  decisions: { team_id: string; decision: "QUALIFIED" | "ELIMINATED"; reason: string }[];
  ties_to_decide: number;
  ties_to_reconcile: number;
  ties_unscheduled: number;
}

export interface PlayerStat {
  player_id: string;
  team_id: string;
  name: string;
  shirt_number: number | null;
  goals?: number;
  penalties?: number;
  appearances?: number;
  yellows?: number;
  second_yellows?: number;
  reds?: number;
  clean_sheets?: number;
}

export interface SuspensionView {
  id: string;
  player_id: string;
  team_id: string;
  name: string;
  reason: "RED_CARD" | "SECOND_YELLOW" | "YELLOW_ACCUMULATION" | "ADMIN";
  matches_total: number;
  matches_served: number;
  status: "ACTIVE" | "SERVED" | "CANCELLED";
  source_match_id: string | null;
  created_at: string;
}

export interface FixtureView {
  id: string;
  scheduled_at: string;
  original_scheduled_at: string | null;
  status: string;
  home_team_id: string;
  away_team_id: string;
  round_label: string;
  matchday: number | null;
  venue_id: string | null;
  stage_id: string | null;
  group_id: string | null;
  home_score: number;
  away_score: number;
  home_pens: number | null;
  away_pens: number | null;
  tie_id: string | null;
  reschedules: number;
}

export interface CompetitionOverview {
  competition: {
    id: string;
    name: string;
    short_name: string;
    format: "LEAGUE" | "GROUPS" | "KNOCKOUT" | "GROUPS_KNOCKOUT";
    status: "DRAFT" | "REGISTRATION" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
    kind: "OFFICIAL" | "FRIENDLY" | "TEST" | "DEMO";
    season: string;
    champion_team_id: string | null;
    runner_up_team_id: string | null;
    third_place_team_id: string | null;
    completed_at: string | null;
    points: [number, number, number];
    tiebreakers: string[];
    extra_time_enabled: boolean;
    penalties_enabled: boolean;
  };
  stages: StageView[];
  scorers: PlayerStat[];
  clean_sheets: PlayerStat[];
  discipline: {
    players: PlayerStat[];
    suspensions: SuspensionView[];
    rules: { enabled: boolean; red_card_matches: number; second_yellow_matches: number; yellow_threshold: number | null; yellow_suspension_matches: number } | null;
  };
  summary: { teams: number; matches_total: number; matches_played: number; live: number; goals: number };
  entries: { team_id: string; name: string; short_name: string; code: string; group_id: string | null; stage_id: string | null; seed: number | null }[];
  stage_ops: StageOps[];
  next_fixtures: FixtureView[];
  fixtures: FixtureView[];
  discipline_alerts: { kind: "SUSPENDED" | "ONE_YELLOW_AWAY"; player_id: string; team_id: string; name: string; detail: string; remaining: number | null }[];
  screening: Record<string, number>;
  recent_activity: { action: string; at: string; entity_type: string; detail: unknown }[];
  discipline_rules: Record<string, unknown> | null;
  lock_state: { begun: boolean };
}

export async function getCompetitionOverview(id: string): Promise<CompetitionOverview | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { db } = await adminDb();
  const res = await db.rpc("admin_competition_overview", { p_competition_id: id });
  if (res.error?.code === "EK404") return null;
  return must(res, "competition overview") as CompetitionOverview;
}

/** team id → names, for every team entered in the competition. */
export function teamNames(o: CompetitionOverview): Map<string, { name: string; short_name: string; code: string }> {
  return new Map(o.entries.map((e) => [e.team_id, { name: e.name, short_name: e.short_name, code: e.code }]));
}

export async function getFixtureHistory(matchId: string) {
  const { db } = await adminDb();
  return must(await db.rpc("admin_fixture_history", { p_match_id: matchId }), "fixture history") as any[];
}
