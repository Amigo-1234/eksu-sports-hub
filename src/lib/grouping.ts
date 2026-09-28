import { dateKey } from "./format";
import type { Competition, MatchSummary } from "./types";

export interface CompetitionGroup {
  competition: Competition;
  matches: MatchSummary[];
}

export interface DateGroup {
  /** Campus date, "YYYY-MM-DD". */
  date: string;
  competitions: CompetitionGroup[];
}

/** Group by competition, preserving the input order of first appearance. */
export function groupByCompetition(matches: MatchSummary[]): CompetitionGroup[] {
  const groups = new Map<string, CompetitionGroup>();
  for (const m of matches) {
    let g = groups.get(m.competitionId);
    if (!g) {
      g = { competition: m.competition, matches: [] };
      groups.set(m.competitionId, g);
    }
    g.matches.push(m);
  }
  return [...groups.values()];
}

/** Group by campus date, then competition. Input order is preserved. */
export function groupByDate(matches: MatchSummary[]): DateGroup[] {
  const days = new Map<string, MatchSummary[]>();
  for (const m of matches) {
    const key = dateKey(m.kickoffAt);
    const list = days.get(key) ?? [];
    list.push(m);
    days.set(key, list);
  }
  return [...days.entries()].map(([date, list]) => ({
    date,
    competitions: groupByCompetition(list),
  }));
}
