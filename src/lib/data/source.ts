import type {
  Competition,
  ID,
  MatchDetail,
  MatchSummary,
  Sport,
  StandingRow, TopScorer,
  Team,
} from "../types";

/**
 * - live:     in play or at half-time, kick-off ascending
 * - upcoming: not yet played (scheduled, or disrupted from today onward), kick-off ascending
 * - results:  finished, or disrupted before today, most recent first
 * - all:      everything, kick-off ascending
 */
export type MatchScope = "live" | "upcoming" | "results" | "all";

export interface MatchQuery {
  scope?: MatchScope;
  competitionId?: ID;
  teamId?: ID;
  /** Campus calendar date, "YYYY-MM-DD". */
  date?: string;
  limit?: number;
}

/**
 * Everything the public frontend reads. The mock implementation lives in
 * `./mock`; a Supabase implementation only needs to satisfy this interface.
 */
export interface SportsDataSource {
  /** Reference "now" (ms) used to decide today / upcoming / live. */
  now(): number;
  getSports(): Promise<Sport[]>;
  getCompetitions(): Promise<Competition[]>;
  getCompetition(id: ID): Promise<Competition | null>;
  getTeams(): Promise<Team[]>;
  getTeam(id: ID): Promise<Team | null>;
  getMatches(query?: MatchQuery): Promise<MatchSummary[]>;
  getMatch(id: ID): Promise<MatchDetail | null>;
  /** Empty for knockout competitions. */
  getStandings(competitionId: ID): Promise<StandingRow[]>;
  /** Goals + penalties by named players (own goals excluded); ties share a rank. */
  getTopScorers(competitionId: ID): Promise<TopScorer[]>;
  /** Completed meetings between two teams, most recent first. */
  getHeadToHead(
    teamA: ID,
    teamB: ID,
    options?: { excludeMatchId?: ID; limit?: number },
  ): Promise<MatchSummary[]>;
}
