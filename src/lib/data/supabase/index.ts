/**
 * Supabase implementation of `SportsDataSource` — real public data.
 *
 * Reads run as the anonymous role with the publishable key (no cookies, no
 * session): RLS decides what the public may see (published competitions
 * only; no staff, audit or squad data). Match events come from the
 * `public_match_feed` RPC, which resolves shirt numbers without exposing
 * squads.
 *
 * Caching: reference data and fixture/result lists are served from Next's
 * data cache for a short window; anything that can be live (live scope,
 * today's matches, a single match) is always fetched fresh. Live pages then
 * keep themselves current through realtime (see src/lib/realtime).
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dateKey } from "../../format";
import { supabaseEnv } from "../../supabase/env";
import { clockFromCanonical, type CanonicalMatch } from "../../operator/canonical";
import { elapsedSeconds } from "../../operator/clock";
import type { Competition, CompetitionDetailView, FormResult, ID, MatchDetail, MatchSummary, PublicPlayerStat, PublicStage, PublicTie, Sport, StandingRow, Team, Venue } from "../../types";
import { PUBLIC_DATA_TAG } from "../cacheTags";
import type { MatchQuery, SportsDataSource } from "../source";
import { sortEvents, toEvent, toLineups, toOutcome, toPublicClock, toPublicStatus, toShootout, toStats } from "./map";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

const REFERENCE_TTL = 300; // teams, competitions, venues, sports
const LIST_TTL = 30; // fixtures, results, standings
const TAG = PUBLIC_DATA_TAG;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function client(ttl: number | "fresh"): SupabaseClient {
  const env = supabaseEnv();
  if (!env.ok) throw new Error(`Public data source is not configured: ${env.error}`);
  const cachedFetch: typeof fetch = (input, init) =>
    fetch(input, ttl === "fresh" ? { ...init, cache: "no-store" } : { ...init, next: { revalidate: ttl, tags: [TAG] } });
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: cachedFetch },
  });
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res.data as T;
}

const TBC_VENUE: Venue = { id: "tbc", name: "Venue to be confirmed", shortName: "Venue TBC" };

function toTeam(t: any): Team {
  return {
    id: t.id,
    name: t.name,
    shortName: t.short_name,
    code: t.code,
    kind: t.kind === "DEPARTMENT" ? "department" : "faculty",
    category: (t.category ?? "MEN").toLowerCase(),
    colors: { primary: t.color_primary, secondary: t.color_secondary },
  };
}

function toCompetition(c: any): Competition {
  return {
    id: c.id,
    sportId: c.sport_id,
    name: c.name,
    shortName: c.short_name,
    season: c.season?.name ?? "",
    // Group stages have tables too; only pure knockouts have none.
    format: c.format === "KNOCKOUT" ? "knockout" : "league",
    engineFormat: c.format,
    ...(c.half_seconds && c.half_seconds !== 2700 ? { halfSeconds: c.half_seconds } : {}),
    category: (c.category ?? "MEN").toLowerCase(),
    description: c.description ?? "",
    teamIds: (c.competition_entries ?? []).map((e: any) => e.team_id),
  };
}

function abandonedMinute(m: any): number | undefined {
  if (m.status !== "ABANDONED" || m.current_period == null) return undefined;
  const end = Date.parse(m.period_ended_at ?? m.finished_at ?? "");
  if (Number.isNaN(end)) return undefined;
  const clock = clockFromCanonical({ ...m, accumulated_pause_seconds: Number(m.accumulated_pause_seconds ?? 0) } as CanonicalMatch);
  return Math.floor(elapsedSeconds(clock, end) / 60) + 1;
}

/** Row fields a public match needs (canonical score + clock, never operator ids). */
export const MATCH_COLS = `id, competition_id, home_team_id, away_team_id, venue_id, scheduled_at, status, status_note,
  home_score, away_score, round_label, seq, current_period, period_started_at, period_ended_at,
  period_offset_seconds, half_seconds, et_half_seconds, clock_running, paused_at, accumulated_pause_seconds, stoppage_seconds, finished_at,
  home_score_90, away_score_90, home_pens, away_pens, winner_team_id, decided_by, matchday, tie_id, stage_id, group_id`;

interface Refs {
  teams: Map<ID, Team>;
  competitions: Map<ID, Competition>;
  venues: Map<ID, Venue>;
}

function toSummary(m: any, refs: Refs): MatchSummary | null {
  const homeTeam = refs.teams.get(m.home_team_id);
  const awayTeam = refs.teams.get(m.away_team_id);
  const competition = refs.competitions.get(m.competition_id);
  if (!homeTeam || !awayTeam || !competition) return null; // not public (e.g. draft)
  const status = toPublicStatus(m.status);
  const started = status !== "SCHEDULED" && status !== "POSTPONED" && status !== "CANCELLED";
  const live = status === "LIVE_FIRST_HALF" || status === "LIVE_SECOND_HALF" || status === "LIVE_EXTRA_TIME";
  return {
    id: m.id,
    competitionId: m.competition_id,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    venueId: m.venue_id ?? TBC_VENUE.id,
    kickoffAt: m.scheduled_at,
    status,
    score: started ? { home: m.home_score, away: m.away_score } : null,
    round: m.round_label || competition.shortName,
    periodStartedAt: live ? m.period_started_at : null,
    statusNote: m.status_note ?? undefined,
    abandonedMinute: abandonedMinute(m),
    seq: Number(m.seq ?? 0),
    clock: toPublicClock(m),
    outcome: toOutcome(m),
    homeTeam,
    awayTeam,
    competition,
    venue: (m.venue_id && refs.venues.get(m.venue_id)) || TBC_VENUE,
  };
}

// ── reference data (cached) ──────────────────────────────────────────────────
async function loadRefs(): Promise<Refs> {
  const db = client(REFERENCE_TTL);
  const [teams, competitions, venues] = await Promise.all([
    db.from("teams").select("id, name, short_name, code, kind, category, color_primary, color_secondary").order("name"),
    db
      .from("competitions")
      .select("id, sport_id, name, short_name, format, category, description, created_at, half_seconds, season:seasons(name), competition_entries(team_id)")
      .order("created_at"),
    db.from("venues").select("id, name, short_name").order("name"),
  ]);
  return {
    teams: new Map((must(teams, "teams") as any[]).map((t) => [t.id, toTeam(t)])),
    competitions: new Map((must(competitions, "competitions") as any[]).map((c) => [c.id, toCompetition(c)])),
    venues: new Map((must(venues, "venues") as any[]).map((v) => [v.id, { id: v.id, name: v.name, shortName: v.short_name }])),
  };
}

// ── campus-day helpers (WAT, UTC+1) ──────────────────────────────────────────
const WAT_MS = 3_600_000;
const dayStartIso = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - WAT_MS).toISOString();
const dayEndIso = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - WAT_MS + 86_400_000).toISOString();

const LIVE = ["1H", "HT", "2H", "ET1", "ET_BREAK", "ET2", "PENS"];
const DISRUPTED = "(POSTPONED,CANCELLED,ABANDONED)";
const DEFAULT_LIMIT = 200;

async function queryMatches(q: MatchQuery): Promise<MatchSummary[]> {
  const scope = q.scope ?? "all";
  const today = dateKey(Date.now());
  // Anything that can be live (or change minute to minute) is always fresh.
  const fresh = scope === "live" || q.date === today || scope === "all";
  const db = client(fresh ? "fresh" : LIST_TTL);
  let query = db.from("matches").select(MATCH_COLS);
  if (scope === "live") query = query.in("status", LIVE);
  if (scope === "upcoming") query = query.or(`status.eq.SCHEDULED,and(status.in.${DISRUPTED},scheduled_at.gte.${dayStartIso(today)})`);
  if (scope === "results") query = query.or(`status.eq.FT,and(status.in.${DISRUPTED},scheduled_at.lt.${dayStartIso(today)})`);
  if (q.competitionId) query = UUID.test(q.competitionId) ? query.eq("competition_id", q.competitionId) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  if (q.teamId) query = UUID.test(q.teamId) ? query.or(`home_team_id.eq.${q.teamId},away_team_id.eq.${q.teamId}`) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  if (q.date) query = query.gte("scheduled_at", dayStartIso(q.date)).lt("scheduled_at", dayEndIso(q.date));
  query = query.order("scheduled_at", { ascending: scope !== "results" }).order("id").limit(q.limit ?? DEFAULT_LIMIT);
  const [rows, refs] = await Promise.all([query, loadRefs()]);
  return (must(rows, "matches") as any[]).map((m) => toSummary(m, refs)).filter((m): m is MatchSummary => m !== null);
}

async function formFor(competitionId: ID): Promise<Map<ID, FormResult[]>> {
  const db = client(LIST_TTL);
  const rows = must(
    await db
      .from("matches")
      .select("id, home_team_id, away_team_id, home_score, away_score, scheduled_at")
      .eq("competition_id", competitionId)
      .eq("status", "FT")
      .order("scheduled_at", { ascending: false })
      .limit(500),
    "form",
  ) as any[];
  const form = new Map<ID, FormResult[]>();
  for (const m of rows) {
    for (const [team, own, other] of [
      [m.home_team_id, m.home_score, m.away_score],
      [m.away_team_id, m.away_score, m.home_score],
    ] as [ID, number, number][]) {
      const list = form.get(team) ?? [];
      if (list.length < 5) list.unshift({ matchId: m.id, outcome: own > other ? "W" : own < other ? "L" : "D" });
      form.set(team, list);
    }
  }
  return form;
}

function toDetail(p: any, refs: Refs, form: Map<ID, FormResult[]>): CompetitionDetailView | null {
  const competition = refs.competitions.get(p.competition.id);
  if (!competition) return null;
  const team = (id: string | null): Team | null => (id ? (refs.teams.get(id) ?? null) : null);
  const stat = (x: any): PublicPlayerStat | null => {
    const t = team(x.team_id);
    if (!t) return null;
    return {
      playerId: x.player_id,
      team: t,
      name: x.name,
      shirtNumber: x.shirt_number ?? null,
      goals: x.goals,
      penalties: x.penalties,
      appearances: x.appearances,
      yellows: x.yellows,
      secondYellows: x.second_yellows,
      reds: x.reds,
      cleanSheets: x.clean_sheets,
    };
  };
  const stages: PublicStage[] = (p.stages ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    type: s.stage_type,
    isKnockout: Boolean(s.is_knockout),
    hasTable: Boolean(s.has_table),
    status: s.status,
    qualifyingPlaces: s.qualification?.per_group ?? s.qualification?.top ?? null,
    groups: (s.groups ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      complete: Boolean(g.complete),
      rows: (g.rows ?? [])
        .map((r: any): StandingRow | null => {
          const t = team(r.team_id);
          if (!t) return null;
          return {
            competitionId: competition.id,
            teamId: r.team_id,
            position: r.rank,
            played: r.played,
            won: r.wins,
            drawn: r.draws,
            lost: r.losses,
            goalsFor: r.goals_for,
            goalsAgainst: r.goals_against,
            goalDifference: r.goal_difference,
            points: r.points,
            form: form.get(r.team_id) ?? [],
            team: t,
            qualification: r.qualification ?? null,
            tied: Boolean(r.tied),
          };
        })
        .filter((r: StandingRow | null): r is StandingRow => r !== null),
    })),
    ties: (s.ties ?? []).map(
      (t: any): PublicTie => ({
        id: t.id,
        code: t.code,
        position: t.position,
        home: { team: team(t.home_team_id), label: t.home_label },
        away: { team: team(t.away_team_id), label: t.away_label },
        matchId: t.match_id ?? null,
        kickoffAt: t.scheduled_at ?? null,
        status: t.status ? toPublicStatus(t.status) : null,
        score: t.status && !["SCHEDULED", "POSTPONED", "CANCELLED"].includes(t.status) ? { home: t.home_score, away: t.away_score } : null,
        shootout: t.home_pens != null && t.away_pens != null ? { home: t.home_pens, away: t.away_pens } : null,
        decidedBy: t.decided_by ?? null,
        winnerTeamId: t.winner_team_id ?? null,
        winnerTo: t.winner_to?.code ?? null,
        underReview: Boolean(t.needs_reconciliation),
      }),
    ),
  }));
  const c = p.competition;
  return {
    competitionId: competition.id,
    format: c.format,
    status: c.status,
    kind: c.kind,
    champion: team(c.champion_team_id),
    runnerUp: team(c.runner_up_team_id),
    thirdPlace: team(c.third_place_team_id),
    stages,
    scorers: (p.scorers ?? []).map(stat).filter(Boolean) as PublicPlayerStat[],
    cleanSheets: (p.clean_sheets ?? []).map(stat).filter(Boolean) as PublicPlayerStat[],
    discipline: {
      players: (p.discipline?.players ?? []).map(stat).filter(Boolean) as PublicPlayerStat[],
      suspensions: (p.discipline?.suspensions ?? [])
        .map((x: any) => {
          const t = team(x.team_id);
          return t ? { id: x.id, team: t, name: x.name, reason: x.reason, matchesTotal: x.matches_total, matchesServed: x.matches_served, status: x.status } : null;
        })
        .filter(Boolean),
      rulesEnabled: Boolean(p.discipline?.rules?.enabled),
    },
    summary: {
      teams: p.summary?.teams ?? 0,
      matchesTotal: p.summary?.matches_total ?? 0,
      matchesPlayed: p.summary?.matches_played ?? 0,
      goals: p.summary?.goals ?? 0,
    },
  };
}

export const supabaseDataSource: SportsDataSource = {
  now: () => Date.now(),

  async getSports(): Promise<Sport[]> {
    const rows = must(await client(REFERENCE_TTL).from("sports").select("id, code, name, active").order("name"), "sports") as any[];
    return rows.map((s) => ({ id: s.id, name: s.name, slug: s.code, status: s.active ? "active" : "coming_soon" }));
  },

  async getCompetitions() {
    return [...(await loadRefs()).competitions.values()];
  },

  async getCompetition(id) {
    return (await loadRefs()).competitions.get(id) ?? null;
  },

  async getTeams() {
    return [...(await loadRefs()).teams.values()];
  },

  async getTeam(id) {
    return (await loadRefs()).teams.get(id) ?? null;
  },

  getMatches: (query = {}) => queryMatches(query),

  async getMatch(id) {
    if (!UUID.test(id)) return null;
    const db = client("fresh");
    const [row, feed, refs] = await Promise.all([
      db.from("matches").select(MATCH_COLS).eq("id", id).maybeSingle(),
      db.rpc("public_match_feed", { p_match_id: id }),
      loadRefs(),
    ]);
    const m = must(row, "match");
    const f = must(feed, "match events") as any;
    if (!m || !f) return null;
    // The feed's match row is the canonical state at the time events were read.
    const summary = toSummary({ ...m, ...f.match }, refs);
    if (!summary) return null;
    const detail: MatchDetail = {
      ...summary,
      events: sortEvents((f.events as any[]).filter((e) => !e.voided).map((e) => toEvent(e, id))),
      lineups: toLineups(f.lineups),
      isDemo: Boolean(f.match?.is_demo),
      stats: toStats(f.stats),
      shootout: toShootout(f.shootout),
    };
    return detail;
  },

  async getStandings(competitionId) {
    if (!UUID.test(competitionId)) return [];
    const refs = await loadRefs();
    const competition = refs.competitions.get(competitionId);
    if (!competition || competition.format !== "league") return [];
    const [rows, form] = await Promise.all([
      client(LIST_TTL)
        .from("standings")
        .select("team_id, group_id, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, rank")
        .eq("competition_id", competitionId)
        .order("group_id", { nullsFirst: true })
        .order("rank"),
      formFor(competitionId),
    ]);
    return (must(rows, "standings") as any[])
      .map((s): StandingRow | null => {
        const team = refs.teams.get(s.team_id);
        if (!team) return null;
        return {
          competitionId,
          teamId: s.team_id,
          position: s.rank,
          played: s.played,
          won: s.wins,
          drawn: s.draws,
          lost: s.losses,
          goalsFor: s.goals_for,
          goalsAgainst: s.goals_against,
          goalDifference: s.goal_difference,
          points: s.points,
          form: form.get(s.team_id) ?? [],
          team,
        };
      })
      .filter((s): s is StandingRow => s !== null);
  },

  async getCompetitionDetail(competitionId) {
    if (!UUID.test(competitionId)) return null;
    const [res, refs, form] = await Promise.all([
      client(LIST_TTL).rpc("public_competition", { p_competition_id: competitionId }),
      loadRefs(),
      formFor(competitionId),
    ]);
    const p = must(res, "competition") as any;
    return p ? toDetail(p, refs, form) : null;
  },

  async getHeadToHead(teamA, teamB, options = {}) {
    if (!UUID.test(teamA) || !UUID.test(teamB)) return [];
    const db = client(LIST_TTL);
    const [rows, refs] = await Promise.all([
      db
        .from("matches")
        .select(MATCH_COLS)
        .eq("status", "FT")
        .or(`and(home_team_id.eq.${teamA},away_team_id.eq.${teamB}),and(home_team_id.eq.${teamB},away_team_id.eq.${teamA})`)
        .order("scheduled_at", { ascending: false })
        .limit((options.limit ?? 10) + 1),
      loadRefs(),
    ]);
    return (must(rows, "head-to-head") as any[])
      .filter((m) => m.id !== options.excludeMatchId)
      .slice(0, options.limit ?? 10)
      .map((m) => toSummary(m, refs))
      .filter((m): m is MatchSummary => m !== null);
  },
};
