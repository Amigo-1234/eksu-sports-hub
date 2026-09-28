import { formatKickoff } from "./format";
import { isDisrupted, isLive, showsScore, statusLongLabel } from "./status";
import type { ID, MatchSummary } from "./types";

export type Side = "home" | "away";

/** Winner of a completed match; null if not finished. */
export function matchWinner(m: Pick<MatchSummary, "status" | "score">): Side | "draw" | null {
  if (m.status !== "FULL_TIME" || !m.score) return null;
  if (m.score.home > m.score.away) return "home";
  if (m.score.home < m.score.away) return "away";
  return "draw";
}

/** Outcome from one team's point of view. */
export function outcomeFor(m: MatchSummary, teamId: ID): "W" | "D" | "L" | null {
  const w = matchWinner(m);
  if (!w) return null;
  if (w === "draw") return "D";
  const side: Side = m.homeTeamId === teamId ? "home" : "away";
  return w === side ? "W" : "L";
}

export function matchHref(id: ID) {
  return `/matches/${encodeURIComponent(id)}`;
}

/** Full sentence describing a match for assistive tech. */
export function matchAccessibleLabel(m: MatchSummary, now: number): string {
  const teams = `${m.homeTeam.name} versus ${m.awayTeam.name}`;
  const score =
    showsScore(m.status) && m.score ? `, ${m.score.home}–${m.score.away}` : "";
  let state: string;
  if (isLive(m.status)) state = `Live, ${statusLongLabel(m.status).toLowerCase()}`;
  else if (m.status === "FULL_TIME") state = "Full-time";
  else if (isDisrupted(m.status)) state = statusLongLabel(m.status);
  else state = `Kick-off ${formatKickoff(m.kickoffAt, now)}`;
  return `${teams}${score}. ${state}. ${m.competition.shortName}.`;
}
