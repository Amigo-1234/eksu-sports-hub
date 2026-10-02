import { formatKickoff } from "./format";
import { isDisrupted, isLive, showsScore, statusLongLabel } from "./status";
import type { ID, MatchSummary } from "./types";

export type Side = "home" | "away";

/** Winner of a completed match (a shoot-out decides a level knockout); null if not finished. */
export function matchWinner(m: Pick<MatchSummary, "status" | "score" | "outcome" | "homeTeamId" | "awayTeamId">): Side | "draw" | null {
  if (m.status !== "FULL_TIME" || !m.score) return null;
  if (m.score.home > m.score.away) return "home";
  if (m.score.home < m.score.away) return "away";
  const w = m.outcome?.winnerTeamId;
  if (w && w === m.homeTeamId) return "home";
  if (w && w === m.awayTeamId) return "away";
  return "draw";
}

/**
 * Knockout result note: "AET", "Engineering win 5–4 on penalties", or — during
 * a shoot-out — "Penalties 3–2". Null for an ordinary result.
 */
export function outcomeNote(m: Pick<MatchSummary, "status" | "outcome" | "homeTeam" | "awayTeam" | "homeTeamId">): string | null {
  const o = m.outcome;
  if (!o) return null;
  if (o.shootout) {
    if (m.status === "FULL_TIME" && o.winnerTeamId) {
      const team = o.winnerTeamId === m.homeTeamId ? m.homeTeam : m.awayTeam;
      const hi = Math.max(o.shootout.home, o.shootout.away);
      const lo = Math.min(o.shootout.home, o.shootout.away);
      return `${team.shortName} win ${hi}–${lo} on penalties`;
    }
    return `Penalties ${o.shootout.home}–${o.shootout.away}`;
  }
  if (m.status === "FULL_TIME" && o.decidedBy === "EXTRA_TIME") return "After extra time";
  return null;
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
  const note = outcomeNote(m);
  return `${teams}${score}${note ? ` (${note})` : ""}. ${state}. ${m.competition.shortName}.`;
}
