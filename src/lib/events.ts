import { formatMinute } from "./status";
import type { MatchDetail, MatchEvent, PlayerRef, Score } from "./types";
import type { Side } from "./match";

export function playerLabel(p: PlayerRef): string {
  return p.name ?? (p.shirtNumber != null ? `No. ${p.shirtNumber}` : "Player not recorded");
}

export function eventMinute(e: MatchEvent): string {
  return formatMinute(e.minute, e.addedTime);
}

export function isScoringEvent(e: MatchEvent): boolean {
  return e.type === "GOAL" || e.type === "PENALTY_GOAL" || e.type === "OWN_GOAL";
}

/** Which side a scoring event counts for (own goals count for the opponent). */
export function scoringSide(e: MatchEvent, m: Pick<MatchDetail, "homeTeamId">): Side {
  const playerSide: Side = e.teamId === m.homeTeamId ? "home" : "away";
  if (e.type !== "OWN_GOAL") return playerSide;
  return playerSide === "home" ? "away" : "home";
}

/** Which side of the timeline an event is drawn on. */
export function displaySide(e: MatchEvent, m: Pick<MatchDetail, "homeTeamId">): Side {
  return isScoringEvent(e) ? scoringSide(e, m) : e.teamId === m.homeTeamId ? "home" : "away";
}

export interface TimelineEntry {
  event: MatchEvent;
  side: Side;
  /** Running score after this event, for scoring events. */
  scoreAfter?: Score;
}

export function buildTimeline(m: MatchDetail): TimelineEntry[] {
  const running: Score = { home: 0, away: 0 };
  return m.events.map((event) => {
    const side = displaySide(event, m);
    if (!isScoringEvent(event)) return { event, side };
    running[scoringSide(event, m)]++;
    return { event, side, scoreAfter: { ...running } };
  });
}

/** Score at half-time, derived from first-half scoring events. */
export function halfTimeScore(m: MatchDetail): Score {
  const s: Score = { home: 0, away: 0 };
  for (const e of m.events) {
    if (e.minute <= 45 && isScoringEvent(e)) s[scoringSide(e, m)]++;
  }
  return s;
}

export interface ScorerLine {
  label: string;
  minutes: string[];
}

/** Goals grouped by scorer for the hero summary. */
export function scorersFor(m: MatchDetail, side: Side): ScorerLine[] {
  const lines = new Map<string, ScorerLine>();
  for (const e of m.events) {
    if (!isScoringEvent(e) || scoringSide(e, m) !== side) continue;
    const suffix = e.type === "OWN_GOAL" ? " (OG)" : "";
    const key = `${e.teamId}-${e.player.shirtNumber}${suffix}`;
    const line = lines.get(key) ?? { label: `${playerLabel(e.player)}${suffix}`, minutes: [] };
    line.minutes.push(eventMinute(e) + (e.type === "PENALTY_GOAL" ? " pen" : ""));
    lines.set(key, line);
  }
  return [...lines.values()];
}
