import "server-only";
import type { LineupEditorState } from "@/lib/lineup";
import { adminDb, must } from "./db";

/*
 * Registered players, screening and squads. All reads go through ADMIN-only
 * RPCs (student numbers and screening data are never readable otherwise).
 */

export type ScreeningStatus = "PENDING" | "CLEARED" | "REJECTED" | "SUSPENDED";
export const SCREENING_STATUSES: ScreeningStatus[] = ["PENDING", "CLEARED", "REJECTED", "SUSPENDED"];

export interface ScreeningRow {
  id: string;
  status: ScreeningStatus;
  player_id: string;
  name: string | null;
  student_id: string | null;
  team: { id: string; name: string; short_name: string; code: string };
  season: { id: string; name: string };
  competition: { id: string; name: string } | null;
  faculty: string | null;
  department: string | null;
  reason: string | null;
  decided_at: string | null;
  screened_on: string | null;
  decided_by: string | null;
  created_at: string;
}

export interface ScreeningFilters {
  status?: ScreeningStatus;
  team?: string;
  season?: string;
  competition?: string;
  faculty?: string;
  department?: string;
  name?: string;
  student?: string;
}

export async function listScreenings(f: ScreeningFilters): Promise<{ counts: Partial<Record<ScreeningStatus, number>>; rows: ScreeningRow[] }> {
  const { db } = await adminDb();
  const data = must(
    await db.rpc("admin_list_screenings", {
      p_status: f.status ?? null,
      p_team_id: f.team ?? null,
      p_season_id: f.season ?? null,
      p_competition_id: f.competition ?? null,
      p_faculty_id: f.faculty ?? null,
      p_department_id: f.department ?? null,
      p_name: f.name ?? null,
      p_student_id: f.student ?? null,
    }),
    "screening queue",
  ) as { counts: Partial<Record<ScreeningStatus, number>> | null; rows: ScreeningRow[] };
  return { counts: data.counts ?? {}, rows: data.rows };
}

export interface Decision {
  from: ScreeningStatus | null;
  to: ScreeningStatus;
  reason: string | null;
  notes: string;
  screened_on: string | null;
  at: string;
  by: string | null;
}

export interface PlayerScreening {
  id: string;
  status: ScreeningStatus;
  reason: string | null;
  notes: string;
  screened_on: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  team: { id: string; name: string; short_name: string };
  season: { id: string; name: string };
  competition: { id: string; name: string } | null;
  history: Decision[];
}

export interface PlayerDetail {
  player: {
    id: string;
    name: string | null;
    created_at: string;
    updated_at: string;
    faculty_id: string | null;
    department_id: string | null;
    faculty: string | null;
    department: string | null;
    student_id: string | null;
    registered_by: string | null;
  };
  screenings: PlayerScreening[];
  squads: {
    id: string;
    squad_id: string;
    active: boolean;
    shirt_number: number;
    position: string | null;
    captain: boolean;
    joined_at: string;
    left_at: string | null;
    left_reason: string | null;
    team: { id: string; name: string; short_name: string };
    season: { id: string; name: string };
    eligibility: string;
  }[];
  lineups: {
    match_id: string;
    scheduled_at: string;
    match_status: string;
    lineup_status: "DRAFT" | "CONFIRMED";
    team: string;
    opponent: string;
    role: "STARTER" | "SUBSTITUTE";
    shirt_number: number;
    captain: boolean;
    eligibility: string;
  }[];
}

export async function getPlayerDetail(id: string): Promise<PlayerDetail | null> {
  const { db } = await adminDb();
  const res = await db.rpc("admin_player_detail", { p_player_id: id });
  if (res.error?.code === "EK404") return null;
  return must(res, "player") as PlayerDetail;
}

export interface PlayerListRow {
  id: string;
  name: string | null;
  student_id: string | null;
  faculty: string | null;
  department: string | null;
  screenings: { id: string; status: ScreeningStatus; team: string; season: string; competition: string | null }[];
  squads: { team: string; season: string; shirt_number: number }[];
}

export async function listPlayers(f: { name?: string; student?: string; team?: string; season?: string; faculty?: string }): Promise<PlayerListRow[]> {
  const { db } = await adminDb();
  return must(
    await db.rpc("admin_list_players", {
      p_name: f.name ?? null,
      p_student_id: f.student ?? null,
      p_team_id: f.team ?? null,
      p_season_id: f.season ?? null,
      p_faculty_id: f.faculty ?? null,
    }),
    "players",
  ) as PlayerListRow[];
}

export interface SquadMemberRow {
  id: string;
  player_id: string;
  name: string | null;
  shirt_number: number;
  position: "GK" | "DF" | "MF" | "FW" | null;
  captain: boolean;
  active: boolean;
  joined_at: string;
  left_at: string | null;
  left_reason: string | null;
  eligibility: string;
}

export async function getSquad(teamId: string, seasonId: string): Promise<{
  squad: { id: string } | null;
  members: SquadMemberRow[];
  /** CLEARED for this team + season; `conflict` names a team they already represent in a shared competition. */
  candidates: { player_id: string; name: string | null; conflict: string | null }[];
}> {
  const { db } = await adminDb();
  return must(await db.rpc("admin_squad", { p_team_id: teamId, p_season_id: seasonId }), "squad") as never;
}

export async function getLineupEditorState(matchId: string, teamId: string): Promise<LineupEditorState | null> {
  const { db } = await adminDb();
  const res = await db.rpc("lineup_editor_state", { p_match_id: matchId, p_team_id: teamId });
  if (res.error && ["EK404", "EK422"].includes(res.error.code ?? "")) return null;
  return must(res, "line-up") as LineupEditorState;
}
