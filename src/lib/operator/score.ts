/**
 * Score and penalty shoot-out arithmetic shared by the state machine and the
 * engine. Pure; mirrors the database (recompute_score / shootout_state).
 */
import type { Score } from "../types.ts";
import type { OpEvent, OpEventType, OpKick, OpMatchState, Side } from "./types.ts";

export const SCORING_TYPES: readonly OpEventType[] = ["GOAL", "PENALTY_GOAL", "OWN_GOAL"];

export const isScoring = (e: Pick<OpEvent, "type">) => SCORING_TYPES.includes(e.type);

export const activeEvents = (s: OpMatchState) => s.events.filter((e) => !e.voided);

const other = (side: Side): Side => (side === "home" ? "away" : "home");

/** Side credited with a scoring event (own goals count for the opponent). */
export function creditedSide(e: Pick<OpEvent, "type" | "side">): Side {
  return e.type === "OWN_GOAL" ? other(e.side) : e.side;
}

/** Score is always recomputed from non-voided scoring events. */
export function computeScore(s: OpMatchState): Score {
  const score: Score = { home: 0, away: 0 };
  for (const e of activeEvents(s)) if (isScoring(e)) score[creditedSide(e)]++;
  return score;
}

export function isLevel(s: OpMatchState): boolean {
  const sc = computeScore(s);
  return sc.home === sc.away;
}

export interface ShootoutTally {
  homeTaken: number;
  awayTaken: number;
  homeScored: number;
  awayScored: number;
  decided: boolean;
  winner: Side | null;
  /** Side to kick next (null once decided). */
  next: Side | null;
}

/** Best of five, then sudden death. Voided kicks never count. */
export function shootoutTally(kicks: readonly OpKick[] | undefined): ShootoutTally {
  const live = (kicks ?? []).filter((k) => !k.voided);
  const ht = live.filter((k) => k.side === "home").length;
  const at = live.filter((k) => k.side === "away").length;
  const hs = live.filter((k) => k.side === "home" && k.outcome === "SCORED").length;
  const as = live.filter((k) => k.side === "away" && k.outcome === "SCORED").length;
  const decided = (ht <= 5 && at <= 5 && (hs + (5 - ht) < as || as + (5 - at) < hs)) || (ht === at && ht >= 5 && hs !== as);
  const first = live[0]?.side ?? "home";
  const next: Side | null = decided ? null : ht === at ? first : ht < at ? "home" : "away";
  return { homeTaken: ht, awayTaken: at, homeScored: hs, awayScored: as, decided, winner: decided ? (hs > as ? "home" : "away") : null, next };
}
