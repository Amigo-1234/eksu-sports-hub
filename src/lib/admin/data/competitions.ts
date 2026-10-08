import "server-only";
import type { CompetitionDetail, CompetitionOption, CompetitionSummary, Stage } from "../types";
import { adminDb, must, TEAM_REF } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

export async function listCompetitions(): Promise<CompetitionSummary[]> {
  const { db } = await adminDb();
  const rows = must(
    await db
      .from("competitions")
      .select(
        "id, name, short_name, status, format, category, season:seasons(id, name, starts_on), sport:sports(id, name), competition_entries(count), competition_stages(count), matches(id)",
      )
      .order("created_at", { ascending: false }),
    "competitions",
  ) as any[];
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    short_name: c.short_name,
    status: c.status,
    format: c.format,
    category: c.category,
    season: { id: c.season.id, name: c.season.name },
    sport: c.sport,
    entry_count: c.competition_entries?.[0]?.count ?? 0,
    stage_count: c.competition_stages?.[0]?.count ?? 0,
    match_count: c.matches?.length ?? 0,
  }));
}

export async function getCompetition(id: string): Promise<CompetitionDetail | null> {
  const { db } = await adminDb();
  const res = await db
    .from("competitions")
    .select(
      `id, name, short_name, description, status, format, category, season_id, sport_id, points_win, points_draw, points_loss,
       tiebreakers, extra_time_enabled, penalties_enabled, allow_multi_team_players, half_seconds, et_half_seconds, special_rules,
       competition_stages(id, name, stage_order, has_table, competition_groups(id, name)),
       competition_entries(id, stage_id, group_id, team:teams(${TEAM_REF})),
       matches(id, status)`,
    )
    .eq("id", id)
    .maybeSingle();
  const c = must(res, "competition") as any;
  if (!c) return null;
  const stages: Stage[] = (c.competition_stages ?? [])
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      stage_order: s.stage_order,
      has_table: s.has_table,
      groups: (s.competition_groups ?? []).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    }))
    .sort((a: Stage, b: Stage) => a.stage_order - b.stage_order);
  return {
    ...c,
    stages,
    entries: (c.competition_entries ?? [])
      .map((e: any) => ({ id: e.id, stage_id: e.stage_id, group_id: e.group_id, team: e.team }))
      .sort((a: any, b: any) => a.team.name.localeCompare(b.team.name)),
    match_count: c.matches?.length ?? 0,
    matches_started: (c.matches ?? []).some((m: any) => m.status !== "SCHEDULED"),
  };
}

/** Competition → stages → groups, for fixture forms and filters. */
export async function listCompetitionOptions(): Promise<CompetitionOption[]> {
  const { db } = await adminDb();
  const rows = must(
    await db
      .from("competitions")
      .select(
        `id, name, short_name, status, season:seasons(name),
         competition_stages(id, name, stage_order, competition_groups(id, name)),
         competition_entries(team_id)`,
      )
      .order("created_at", { ascending: false }),
    "competitions",
  ) as any[];
  return rows.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    short_name: c.short_name as string,
    status: c.status as CompetitionOption["status"],
    season: c.season?.name as string,
    stages: (c.competition_stages ?? [])
      .sort((a: any, b: any) => a.stage_order - b.stage_order)
      .map((s: any) => ({ id: s.id as string, name: s.name as string, groups: (s.competition_groups ?? []) as { id: string; name: string }[] })),
    teamIds: (c.competition_entries ?? []).map((e: any) => e.team_id as string),
  }));
}
export type { CompetitionOption };
