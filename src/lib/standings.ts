import type { FormResult, ID, Match, Standing } from "./types";

const FORM_LENGTH = 5;

/**
 * Build a league table from completed matches. Only FULL_TIME matches count;
 * abandoned, postponed and cancelled fixtures are ignored.
 * Ordering: points, goal difference, goals scored, then team ID for stability.
 */
export function computeStandings(
  competitionId: ID,
  teamIds: ID[],
  matches: Match[],
): Standing[] {
  const rows = new Map<ID, Standing>(
    teamIds.map((teamId) => [
      teamId,
      {
        competitionId,
        teamId,
        position: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        form: [] as FormResult[],
      },
    ]),
  );

  const completed = matches
    .filter((m) => m.competitionId === competitionId && m.status === "FULL_TIME" && m.score)
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

  for (const m of completed) {
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away || !m.score) continue;
    const { home: hg, away: ag } = m.score;
    home.played++;
    away.played++;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;
    if (hg > ag) {
      home.won++;
      away.lost++;
      home.form.push({ matchId: m.id, outcome: "W" });
      away.form.push({ matchId: m.id, outcome: "L" });
    } else if (hg < ag) {
      away.won++;
      home.lost++;
      home.form.push({ matchId: m.id, outcome: "L" });
      away.form.push({ matchId: m.id, outcome: "W" });
    } else {
      home.drawn++;
      away.drawn++;
      home.form.push({ matchId: m.id, outcome: "D" });
      away.form.push({ matchId: m.id, outcome: "D" });
    }
  }

  const table = [...rows.values()].map((r) => ({
    ...r,
    goalDifference: r.goalsFor - r.goalsAgainst,
    points: r.won * 3 + r.drawn,
    form: r.form.slice(-FORM_LENGTH),
  }));

  table.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamId.localeCompare(b.teamId),
  );
  table.forEach((r, i) => (r.position = i + 1));
  return table;
}
