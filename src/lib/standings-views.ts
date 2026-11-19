import type { MatchSummary, StandingRow } from "./types";

export interface NextFixture {
  matchId: string;
  opponent: string;
  home: boolean;
  kickoffAt: string;
}

/**
 * Home-only and away-only tables (Flashscore's Home / Away tabs), rebuilt from
 * the league's completed results. Same tie-breaks as the overall table:
 * points, goal difference, goals scored, then name.
 */
export function splitTable(overall: StandingRow[], results: MatchSummary[], side: "home" | "away"): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    overall.map((r) => [
      r.teamId,
      { ...r, live: undefined, movement: undefined, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, form: [] },
    ]),
  );
  const done = results
    .filter((m) => m.status === "FULL_TIME" && m.score)
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  for (const m of done) {
    const teamId = side === "home" ? m.homeTeamId : m.awayTeamId;
    const r = rows.get(teamId);
    if (!r || !m.score) continue;
    const gf = side === "home" ? m.score.home : m.score.away;
    const ga = side === "home" ? m.score.away : m.score.home;
    const o: "W" | "D" | "L" = gf > ga ? "W" : gf < ga ? "L" : "D";
    r.played++;
    r.goalsFor += gf;
    r.goalsAgainst += ga;
    if (o === "W") {
      r.won++;
      r.points += 3;
    } else if (o === "D") {
      r.drawn++;
      r.points += 1;
    } else r.lost++;
    r.form = [...r.form, { matchId: m.id, outcome: o }].slice(-5);
  }
  const list = [...rows.values()].map((r) => ({ ...r, goalDifference: r.goalsFor - r.goalsAgainst }));
  list.sort(
    (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name),
  );
  return list.map((r, i) => ({ ...r, position: i + 1 }));
}

/** Each team's next scheduled league match (the "?" chip in the form column). */
export function nextFixtures(upcoming: MatchSummary[]): Record<string, NextFixture> {
  const out: Record<string, NextFixture> = {};
  const sorted = [...upcoming].filter((m) => m.status === "SCHEDULED").sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  for (const m of sorted) {
    out[m.homeTeamId] ??= { matchId: m.id, opponent: m.awayTeam.shortName, home: true, kickoffAt: m.kickoffAt };
    out[m.awayTeamId] ??= { matchId: m.id, opponent: m.homeTeam.shortName, home: false, kickoffAt: m.kickoffAt };
  }
  return out;
}
