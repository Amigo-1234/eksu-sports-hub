import "server-only";
import { dateKey } from "@/lib/format";
import { watDayRange } from "../time";
import type { LiveMatch, MatchFilters, MatchRow, MatchStatus } from "../types";
import { adminDb, must, TEAM_REF } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

// Score columns are read for display only; no admin form ever writes them.
const MATCH_ROW = `id, status, status_note, scheduled_at, round_label, home_score, away_score,
  competition:competitions(id, short_name, name),
  stage:competition_stages(id, name), group:competition_groups(id, name),
  home:teams!matches_home_team_id_fkey(${TEAM_REF}), away:teams!matches_away_team_id_fkey(${TEAM_REF}),
  venue:venues(id, short_name),
  operator_assignments(user_id, role, active, profile:profiles!operator_assignments_user_id_fkey(display_name))`;

function toRow(m: any): MatchRow {
  return {
    ...m,
    assignments: (m.operator_assignments ?? [])
      .filter((a: any) => a.active)
      .map((a: any) => ({ user_id: a.user_id, role: a.role, active: a.active, display_name: a.profile?.display_name })),
  };
}

export const STATUS_FILTERS: Record<string, MatchStatus[]> = {
  live: ["1H", "HT", "2H"],
  scheduled: ["SCHEDULED"],
  ht: ["HT"],
  ft: ["FT"],
  postponed: ["POSTPONED"],
  cancelled: ["CANCELLED"],
  abandoned: ["ABANDONED"],
};

export async function listMatches(f: MatchFilters, limit = 200): Promise<{ rows: MatchRow[]; truncated: boolean }> {
  const { db } = await adminDb();
  let q = db.from("matches").select(MATCH_ROW).order("scheduled_at", { ascending: true }).limit(limit + 1);
  const day = f.date ? watDayRange(f.date) : null;
  if (day) q = q.gte("scheduled_at", day.from).lt("scheduled_at", day.to);
  const from = f.from ? watDayRange(f.from) : null;
  const to = f.to ? watDayRange(f.to) : null;
  if (from) q = q.gte("scheduled_at", from.from);
  if (to) q = q.lt("scheduled_at", to.to);
  if (f.competition) q = q.eq("competition_id", f.competition);
  if (f.status && STATUS_FILTERS[f.status]) q = q.in("status", STATUS_FILTERS[f.status]);
  if (f.team) q = q.or(`home_team_id.eq.${f.team},away_team_id.eq.${f.team}`);
  if (f.venue) q = q.eq("venue_id", f.venue);
  let rows = (must(await q, "fixtures") as any[]).map(toRow);
  if (f.operator === "no-primary") rows = rows.filter((m) => !m.assignments.some((a) => a.role === "PRIMARY"));
  else if (f.operator === "none") rows = rows.filter((m) => m.assignments.length === 0);
  else if (f.operator) rows = rows.filter((m) => m.assignments.some((a) => a.user_id === f.operator));
  const truncated = rows.length > limit;
  return { rows: rows.slice(0, limit), truncated };
}

export async function getMatchRow(id: string): Promise<(MatchRow & { competition_id: string; stage_id: string | null; group_id: string | null; venue_id: string | null; home_team_id: string; away_team_id: string }) | null> {
  const { db } = await adminDb();
  const m = must(
    await db.from("matches").select(`${MATCH_ROW}, competition_id, stage_id, group_id, venue_id, home_team_id, away_team_id`).eq("id", id).maybeSingle(),
    "fixture",
  );
  return m ? (toRow(m) as any) : null;
}

export interface TeamLineupSummary {
  status: "DRAFT" | "CONFIRMED";
  formation: string | null;
  confirmed_at: string | null;
  problems: string[];
  players: { player_id: string; name: string | null; shirt_number: number; role: "STARTER" | "SUBSTITUTE"; captain: boolean }[];
}

export interface MatchInspection {
  state: {
    match: LiveMatch["match"] & { seq: number; home_team_id: string; away_team_id: string };
    events: {
      id: string; seq: number; type: string; period: number; minute: number; minute_extra: number; team_id: string;
      player_id: string | null; related_player_id: string | null; shirt_number: number | null; related_shirt_number: number | null;
      recorded_at: string; voided_at: string | null; void_reason: string | null; client_queued?: boolean;
    }[];
    server_time: string;
  };
  match: {
    started_at: string | null;
    finished_at: string | null;
    active_operator_name: string | null;
    status_note: string | null;
    lineup_override_reason: string | null;
    lineup_override_at: string | null;
    lineup_override_by_name: string | null;
  };
  lineups: { home: TeamLineupSummary | null; away: TeamLineupSummary | null };
  periods: { period: number; started_at: string; ended_at: string | null }[];
  recorders: Record<string, string>;
  assignments: { user_id: string; role: "PRIMARY" | "BACKUP"; active: boolean; assigned_at: string; revoked_at: string | null; prep_completed_at: string | null; display_name: string; email: string }[];
  audit: { id: string; at: string; action: string; entity_type: string; entity_id: string | null; actor: string | null; before: unknown; after: unknown }[];
}

export async function inspectMatch(id: string): Promise<MatchInspection> {
  const { db } = await adminDb();
  return must(await db.rpc("admin_match_detail", { p_match_id: id }), "match detail") as MatchInspection;
}

export async function listLiveMatches(): Promise<LiveMatch[]> {
  const { db } = await adminDb();
  return (must(await db.rpc("admin_live_matches"), "live matches") ?? []) as LiveMatch[];
}

export async function listEventTypes(): Promise<{ code: string; name: string; requires_player: boolean; requires_related_player: boolean }[]> {
  const { db } = await adminDb();
  return must(await db.from("event_types").select("code, name, requires_player, requires_related_player").order("name"), "event types") as any;
}

/** Today's campus-day key, computed on the server. */
export function todayKey(): string {
  return dateKey(Date.now());
}
