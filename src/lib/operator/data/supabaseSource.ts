import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LineupEditorState } from "@/lib/lineup";
import type { Competition, MatchDetail, Team, Venue } from "@/lib/types";
import { fromCanonical, type CanonicalLineup, type CanonicalMatch, type CanonicalState } from "../canonical";
import { toPublicStatus } from "../machine";
import type { OpLineup, PrepChecks } from "../types";
import type { OperatorDataSource } from "./source";

const TEAM_COLS = "id, name, short_name, code, kind, category, color_primary, color_secondary";
const MATCH_COLS = `
  id, round_label, scheduled_at, status, status_note, home_score, away_score, seq,
  current_period, period_started_at, period_ended_at, period_offset_seconds, clock_running,
  paused_at, accumulated_pause_seconds, stoppage_seconds, home_team_id, away_team_id,
  competition:competitions(id, name, short_name, format, category, description, season:seasons(name)),
  venue:venues(id, name, short_name),
  home:teams!matches_home_team_id_fkey(${TEAM_COLS}),
  away:teams!matches_away_team_id_fkey(${TEAM_COLS}),
  events:match_events(id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id, recorded_at, voided_at, void_reason)
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */
function toTeam(t: any): Team {
  return {
    id: t.id,
    name: t.name,
    shortName: t.short_name,
    code: t.code,
    kind: t.kind === "DEPARTMENT" ? "department" : "faculty",
    category: t.category === "WOMEN" ? "women" : t.category === "MIXED" ? "mixed" : "men",
    colors: { primary: t.color_primary, secondary: t.color_secondary },
  };
}

function toMatchDetail(m: any): MatchDetail {
  const competition: Competition = {
    id: m.competition.id,
    sportId: "football",
    name: m.competition.name,
    shortName: m.competition.short_name,
    season: m.competition.season?.name ?? "",
    format: m.competition.format === "KNOCKOUT" ? "knockout" : "league",
    category: m.competition.category === "WOMEN" ? "women" : m.competition.category === "MIXED" ? "mixed" : "men",
    description: m.competition.description,
    teamIds: [],
  };
  const venue: Venue = m.venue
    ? { id: m.venue.id, name: m.venue.name, shortName: m.venue.short_name }
    : { id: "tbc", name: "Venue to be confirmed", shortName: "TBC" };
  const status = toPublicStatus(fromCanonical({ match: m, events: [] }).phase);
  return {
    id: m.id,
    competitionId: competition.id,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    venueId: venue.id,
    kickoffAt: m.scheduled_at,
    status,
    score: m.status === "SCHEDULED" ? null : { home: m.home_score, away: m.away_score },
    round: m.round_label,
    periodStartedAt: m.period_started_at,
    ...(m.status_note ? { statusNote: m.status_note } : {}),
    homeTeam: toTeam(m.home),
    awayTeam: toTeam(m.away),
    competition,
    venue,
    events: [],
  };
}

function toPrep(p: any): PrepChecks {
  return { atVenue: !!p?.atVenue, teamsPresent: !!p?.teamsPresent, officialsReady: !!p?.officialsReady };
}

function toLineup(l: CanonicalLineup | null | undefined): OpLineup | null {
  if (!l) return null;
  return {
    status: l.status,
    formation: l.formation,
    problems: l.problems ?? [],
    players: (l.players ?? []).map((p) => ({
      playerId: p.player_id,
      shirt: p.shirt_number,
      name: p.name,
      role: p.role,
      position: p.position,
      captain: p.captain,
      goalkeeper: p.goalkeeper,
    })),
  };
}

function canonicalFromRow(m: any): CanonicalState {
  const match: CanonicalMatch = { ...m };
  const events = [...(m.events ?? [])].sort((a: any, b: any) => a.seq - b.seq);
  return { match, events, log: [] };
}

export const supabaseOperatorDataSource: OperatorDataSource = {
  kind: "supabase",

  async getCurrentOperator() {
    const sb = await createSupabaseServerClient();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const [profile, roles] = await Promise.all([
      sb.from("profiles").select("display_name, deactivated_at").eq("id", data.user.id).maybeSingle(),
      sb.from("user_roles").select("role:roles(code)").eq("user_id", data.user.id),
    ]);
    return {
      id: data.user.id,
      displayName: profile.data?.display_name ?? data.user.email ?? "Operator",
      // Deactivated staff keep their role rows but lose every permission (see private.has_role).
      roles: profile.data?.deactivated_at ? [] : (roles.data ?? []).map((r: any) => r.role?.code).filter(Boolean),
    };
  },

  async getAssignmentSeeds(operator) {
    const sb = await createSupabaseServerClient();
    // Filtered in the query (own, active) and again by RLS.
    const { data, error } = await sb
      .from("operator_assignments")
      .select(`id, role, prep_checks, match:matches!inner(${MATCH_COLS})`)
      .eq("user_id", operator.id)
      .eq("active", true);
    if (error) throw new Error(`Could not load assignments: ${error.message}`);
    return (data ?? []).map((a: any) => ({
      assignment: { matchId: a.match.id, operatorId: operator.id, role: a.role, prep: toPrep(a.prep_checks) },
      match: toMatchDetail(a.match),
      canonical: fromCanonical(canonicalFromRow(a.match)),
    }));
  },

  async getAssignmentSeed(operator, matchId) {
    if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null;
    const sb = await createSupabaseServerClient();
    const { data: a, error } = await sb
      .from("operator_assignments")
      .select(`id, role, prep_checks, match:matches!inner(${MATCH_COLS})`)
      .eq("user_id", operator.id)
      .eq("active", true)
      .eq("match_id", matchId)
      .maybeSingle();
    if (error) throw new Error(`Could not load assignment: ${error.message}`);
    if (!a) return null;
    const state = await sb.rpc("operator_match_state", { p_match_id: matchId });
    if (state.error) throw new Error(`Could not load match state: ${state.error.message}`);
    const c = state.data as CanonicalState;
    const row: any = a;
    return {
      assignment: { matchId, operatorId: operator.id, role: row.role, prep: toPrep(row.prep_checks) },
      match: toMatchDetail(row.match),
      canonical: fromCanonical(c),
      inControl: !!c.in_control,
      squads: {
        home: (c.squads?.home ?? []).map((p) => ({ playerId: p.player_id, shirt: p.shirt_number, name: p.name ?? null })),
        away: (c.squads?.away ?? []).map((p) => ({ playerId: p.player_id, shirt: p.shirt_number, name: p.name ?? null })),
      },
      lineups: { home: toLineup(c.lineups?.home), away: toLineup(c.lineups?.away) },
      lineupOverride: c.lineup_override ?? null,
      lineupControl: !!c.lineup_control,
    };
  },

  async getLineupEditorState(matchId, teamId) {
    if (!/^[0-9a-f-]{36}$/i.test(matchId) || !/^[0-9a-f-]{36}$/i.test(teamId)) return null;
    const sb = await createSupabaseServerClient();
    // The RPC checks the active assignment and filters to eligible players.
    const { data, error } = await sb.rpc("lineup_editor_state", { p_match_id: matchId, p_team_id: teamId });
    if (error) {
      if (["EK403", "EK404", "EK422"].includes(error.code ?? "")) return null;
      throw new Error(`Could not load line-up: ${error.message}`);
    }
    return data as LineupEditorState;
  },
};
