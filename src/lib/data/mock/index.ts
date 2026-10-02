/**
 * Mock implementation of `SportsDataSource` — DEMO DATA, development only.
 *
 * Set `MOCK_SCENARIO` to exercise UI states:
 *   default  – live, today, upcoming and results (default)
 *   no-live  – nothing currently in play
 *   empty    – no matches at all
 *   error    – every match query throws
 */
import { dateKey } from "../../format";
import { isDisrupted, isLive } from "../../status";
import { computeStandings } from "../../standings";
import type { ID, Match, MatchSummary } from "../../types";
import type { MatchQuery, SportsDataSource } from "../source";
import { buildMatches, type MockMatchData } from "./matches";
import { competitions, sports, teams, venues } from "./reference";

type Scenario = "default" | "no-live" | "empty" | "error";

function scenario(): Scenario {
  const s = process.env.MOCK_SCENARIO;
  return s === "no-live" || s === "empty" || s === "error" ? s : "default";
}

const FIVE_MINUTES = 5 * 60_000;

let cache: { anchor: number; data: MockMatchData } | null = null;

/**
 * Data is rebuilt around a reference time snapped to 5 minutes, so every
 * request in the same window sees an identical snapshot.
 */
function dataset(): MockMatchData & { anchor: number } {
  const anchor = Math.floor(Date.now() / FIVE_MINUTES) * FIVE_MINUTES;
  if (!cache || cache.anchor !== anchor) {
    cache = { anchor, data: buildMatches(anchor) };
  }
  let { matches } = cache.data;
  const s = scenario();
  if (s === "error") throw new Error("Mock data source error (MOCK_SCENARIO=error)");
  if (s === "empty") matches = [];
  if (s === "no-live") matches = matches.filter((m) => !isLive(m.status));
  return { anchor, matches, events: cache.data.events };
}

const byId = <T extends { id: ID }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const teamMap = byId(teams);
const competitionMap = byId(competitions);
const venueMap = byId(venues);

function join(m: Match): MatchSummary {
  const homeTeam = teamMap.get(m.homeTeamId);
  const awayTeam = teamMap.get(m.awayTeamId);
  const competition = competitionMap.get(m.competitionId);
  const venue = venueMap.get(m.venueId);
  if (!homeTeam || !awayTeam || !competition || !venue) {
    throw new Error(`Mock data integrity error in match ${m.id}`);
  }
  return { ...m, homeTeam, awayTeam, competition, venue };
}

const byKickoffAsc = (a: Match, b: Match) =>
  a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id);
const byKickoffDesc = (a: Match, b: Match) =>
  b.kickoffAt.localeCompare(a.kickoffAt) || a.id.localeCompare(b.id);

function inScope(m: Match, scope: MatchQuery["scope"], todayKey: string): boolean {
  switch (scope) {
    case "live":
      return isLive(m.status);
    case "upcoming":
      return (
        m.status === "SCHEDULED" || (isDisrupted(m.status) && dateKey(m.kickoffAt) >= todayKey)
      );
    case "results":
      return (
        m.status === "FULL_TIME" || (isDisrupted(m.status) && dateKey(m.kickoffAt) < todayKey)
      );
    default:
      return true;
  }
}

/** Simulates network latency in development so loading states are visible. */
const latency = () =>
  process.env.MOCK_LATENCY_MS
    ? new Promise((r) => setTimeout(r, Number(process.env.MOCK_LATENCY_MS)))
    : Promise.resolve();

export const mockDataSource: SportsDataSource = {
  now: () => Date.now(),

  async getSports() {
    return sports;
  },

  async getCompetitions() {
    return competitions;
  },

  async getCompetition(id) {
    return competitionMap.get(id) ?? null;
  },

  async getTeams() {
    return teams;
  },

  async getTeam(id) {
    return teamMap.get(id) ?? null;
  },

  async getMatches(query = {}) {
    await latency();
    const { matches, anchor } = dataset();
    const todayKey = dateKey(anchor);
    const scope = query.scope ?? "all";
    const filtered = matches.filter(
      (m) =>
        inScope(m, scope, todayKey) &&
        (!query.competitionId || m.competitionId === query.competitionId) &&
        (!query.teamId || m.homeTeamId === query.teamId || m.awayTeamId === query.teamId) &&
        (!query.date || dateKey(m.kickoffAt) === query.date),
    );
    filtered.sort(scope === "results" ? byKickoffDesc : byKickoffAsc);
    const limited = query.limit ? filtered.slice(0, query.limit) : filtered;
    return limited.map(join);
  },

  async getMatch(id) {
    await latency();
    const { matches, events } = dataset();
    const m = matches.find((x) => x.id === id);
    if (!m) return null;
    return { ...join(m), events: events.get(id) ?? [] };
  },

  // The demo data has no competition-engine view (stages / bracket / stats).
  async getCompetitionDetail() {
    return null;
  },

  async getStandings(competitionId) {
    const competition = competitionMap.get(competitionId);
    if (!competition || competition.format !== "league") return [];
    const { matches } = dataset();
    return computeStandings(competitionId, competition.teamIds, matches).map((s) => {
      const team = teamMap.get(s.teamId);
      if (!team) throw new Error(`Unknown team ${s.teamId}`);
      return { ...s, team };
    });
  },

  async getHeadToHead(teamA, teamB, options = {}) {
    const { matches } = dataset();
    const meetings = matches
      .filter(
        (m) =>
          m.id !== options.excludeMatchId &&
          m.status === "FULL_TIME" &&
          ((m.homeTeamId === teamA && m.awayTeamId === teamB) ||
            (m.homeTeamId === teamB && m.awayTeamId === teamA)),
      )
      .sort(byKickoffDesc);
    return (options.limit ? meetings.slice(0, options.limit) : meetings).map(join);
  },
};
