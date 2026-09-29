import "server-only";
import type { Squad, Team, TeamRef } from "../types";
import { adminDb, must, TEAM_REF } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

const TEAM_COLS = `id, name, short_name, code, slug, kind, category, active, faculty_id, department_id, sport_id,
  color_primary, color_secondary, faculty:faculties(id, name), department:departments(id, name)`;

export async function listTeams(q?: string): Promise<Team[]> {
  const { db } = await adminDb();
  let query = db.from("teams").select(TEAM_COLS).order("name");
  const term = q?.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`name.ilike.%${term}%,short_name.ilike.%${term}%,code.ilike.%${term}%,slug.ilike.%${term}%`);
  return must(await query, "teams") as unknown as Team[];
}

export async function listTeamRefs(): Promise<(TeamRef & { active: boolean })[]> {
  const { db } = await adminDb();
  return must(await db.from("teams").select(`${TEAM_REF}, active`).order("name"), "teams") as any;
}

export async function getTeam(id: string): Promise<Team | null> {
  const { db } = await adminDb();
  return must(await db.from("teams").select(TEAM_COLS).eq("id", id).maybeSingle(), "team") as unknown as Team | null;
}

export async function listSquads(teamId: string): Promise<Squad[]> {
  const { db } = await adminDb();
  const rows = must(
    await db
      .from("squads")
      .select("id, team_id, season:seasons(id, name, starts_on), squad_players(id, player_id, shirt_number, position, is_captain, active, player:players(display_name))")
      .eq("team_id", teamId),
    "squads",
  ) as any[];
  return rows
    .sort((a, b) => String(b.season.starts_on).localeCompare(String(a.season.starts_on)))
    .map((s) => ({
      id: s.id,
      team_id: s.team_id,
      season: { id: s.season.id, name: s.season.name },
      players: (s.squad_players ?? [])
        .filter((p: any) => p.active)
        .map((p: any) => ({
          id: p.id,
          player_id: p.player_id,
          display_name: p.player?.display_name ?? null,
          shirt_number: p.shirt_number,
          position: p.position,
          is_captain: p.is_captain,
        }))
        .sort((a: any, b: any) => a.shirt_number - b.shirt_number),
    }));
}

/**
 * Players of both teams for correction pickers: the team's CONFIRMED match
 * line-up when there is one (the only players who can appear in events),
 * otherwise the active season squad.
 */
export async function squadsForMatch(matchId: string) {
  const { db } = await adminDb();
  const m = must(
    await db.from("matches").select("home_team_id, away_team_id, competition:competitions(season_id)").eq("id", matchId).maybeSingle(),
    "match",
  ) as any;
  if (!m) return { home: [], away: [] };
  const [squads, lineups] = await Promise.all([
    db
      .from("squads")
      .select("team_id, squad_players(player_id, shirt_number, active, player:players(display_name))")
      .eq("season_id", m.competition.season_id)
      .in("team_id", [m.home_team_id, m.away_team_id]),
    db
      .from("match_lineups")
      .select("team_id, lineup_players(player_id, shirt_number, player:players(display_name))")
      .eq("match_id", matchId)
      .eq("status", "CONFIRMED"),
  ]);
  const squadRows = must(squads, "squads") as any[];
  const lineupRows = must(lineups, "line-ups") as any[];
  const of = (team: string) => {
    const lineup = lineupRows.find((r) => r.team_id === team);
    const rows = lineup ? lineup.lineup_players : (squadRows.find((r) => r.team_id === team)?.squad_players ?? []).filter((p: any) => p.active);
    return (rows ?? [])
      .map((p: any) => ({ player_id: p.player_id as string, shirt_number: p.shirt_number as number, name: (p.player?.display_name ?? null) as string | null }))
      .sort((a: any, b: any) => a.shirt_number - b.shirt_number);
  };
  return { home: of(m.home_team_id), away: of(m.away_team_id) };
}
