import type { FormResult, ID, Match, MatchStatus, StandingRow } from "./types";

/** Statuses during which a match counts towards the live table. */
const IN_PLAY: ReadonlySet<MatchStatus> = new Set<MatchStatus>(["LIVE_FIRST_HALF", "HALF_TIME", "LIVE_SECOND_HALF"]);

export interface LivePoints {
  win: number;
  draw: number;
  loss: number;
}

const DEFAULT_POINTS: LivePoints = { win: 3, draw: 1, loss: 0 };

type LiveMatch = Pick<Match, "id" | "competitionId" | "homeTeamId" | "awayTeamId" | "status" | "score">;

/**
 * Live table: the stored standings (completed matches only) plus every match
 * in progress, counted as if it ended at its current score. Rows are re-ranked
 * by points, goal difference and goals scored. Positions always run 1, 2, 3…
 * (teams level on everything keep their stored order rather than sharing a
 * rank). Each team playing now carries `live` (current outcome and score) and
 * `movement` (places gained, positive, or lost, negative).
 *
 * Group tables (the position restarts partway down the list) are numbered
 * 1, 2, 3… within each group but not re-ranked live.
 */
export function numberSequentially(rows: StandingRow[]): StandingRow[] {
  let n = 0;
  return rows.map((r, i) => {
    n = i > 0 && r.position < rows[i - 1].position ? 1 : n + 1;
    return n === r.position ? r : { ...r, position: n };
  });
}

export function applyLiveMatches(
  rows: StandingRow[],
  matches: LiveMatch[],
  points: LivePoints = DEFAULT_POINTS,
): StandingRow[] {
  if (rows.length === 0) return rows;
  const grouped = rows.some((r, i) => i > 0 && r.position < rows[i - 1].position);
  rows = numberSequentially(rows);
  if (grouped) return rows;

  const byTeam = new Map<ID, StandingRow>(rows.map((r) => [r.teamId, { ...r, form: [...r.form], live: undefined, movement: undefined }]));
  const live = matches.filter(
    (m) =>
      IN_PLAY.has(m.status) &&
      m.score &&
      m.competitionId === rows[0].competitionId &&
      byTeam.has(m.homeTeamId) &&
      byTeam.has(m.awayTeamId),
  );
  if (live.length === 0) return rows;

  const apply = (row: StandingRow, matchId: ID, gf: number, ga: number) => {
    const outcome: FormResult["outcome"] = gf > ga ? "W" : gf < ga ? "L" : "D";
    row.played += 1;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    if (outcome === "W") {
      row.won += 1;
      row.points += points.win;
    } else if (outcome === "D") {
      row.drawn += 1;
      row.points += points.draw;
    } else {
      row.lost += 1;
      row.points += points.loss;
    }
    row.live = { matchId, outcome, goalsFor: gf, goalsAgainst: ga };
  };

  for (const m of live) {
    const { home, away } = m.score!;
    apply(byTeam.get(m.homeTeamId)!, m.id, home, away);
    apply(byTeam.get(m.awayTeamId)!, m.id, away, home);
  }

  const order = new Map(rows.map((r, i) => [r.teamId, i]));
  const level = (a: StandingRow, b: StandingRow) =>
    b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
  const table = [...byTeam.values()].sort((a, b) => level(a, b) || order.get(a.teamId)! - order.get(b.teamId)!);
  return table.map((r, i) => {
    const position = i + 1;
    // Arrows only for the teams playing now: they are the ones the live score moves.
    return { ...r, movement: r.live ? r.position - position : undefined, position };
  });
}
