import type { MatchStatus } from "./types";

/**
 * Backend clock state machine: PRE → 1H → HT → 2H → FT.
 * A match can also be taken out of the normal flow (postponed before kick-off,
 * cancelled, or abandoned mid-play). The public UI only ever sees `MatchStatus`.
 */
export type MatchPhase = "PRE" | "1H" | "HT" | "2H" | "FT";
export type MatchDisposition = "NORMAL" | "POSTPONED" | "CANCELLED" | "ABANDONED";

export function toMatchStatus(
  phase: MatchPhase,
  disposition: MatchDisposition = "NORMAL",
): MatchStatus {
  if (disposition !== "NORMAL") return disposition;
  switch (phase) {
    case "PRE":
      return "SCHEDULED";
    case "1H":
      return "LIVE_FIRST_HALF";
    case "HT":
      return "HALF_TIME";
    case "2H":
      return "LIVE_SECOND_HALF";
    case "FT":
      return "FULL_TIME";
  }
}

export const LIVE_STATUSES: readonly MatchStatus[] = [
  "LIVE_FIRST_HALF",
  "HALF_TIME",
  "LIVE_SECOND_HALF",
];

/** Match is underway (including half-time). */
export function isLive(status: MatchStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/** Ball is currently in play (clock running). */
export function isClockRunning(status: MatchStatus): boolean {
  return status === "LIVE_FIRST_HALF" || status === "LIVE_SECOND_HALF";
}

export function isFinished(status: MatchStatus): boolean {
  return status === "FULL_TIME";
}

/** Match will not be (or was not) completed as scheduled. */
export function isDisrupted(status: MatchStatus): boolean {
  return status === "POSTPONED" || status === "CANCELLED" || status === "ABANDONED";
}

/** Whether a score should be displayed for this status. */
export function showsScore(status: MatchStatus): boolean {
  return isLive(status) || status === "FULL_TIME" || status === "ABANDONED";
}

/** Compact status code for list rows. `null` means show kick-off time/minute instead. */
export function statusShortLabel(status: MatchStatus): string | null {
  switch (status) {
    case "HALF_TIME":
      return "HT";
    case "FULL_TIME":
      return "FT";
    case "POSTPONED":
      return "PST";
    case "CANCELLED":
      return "CAN";
    case "ABANDONED":
      return "ABD";
    default:
      return null;
  }
}

export function statusLongLabel(status: MatchStatus): string {
  switch (status) {
    case "SCHEDULED":
      return "Scheduled";
    case "LIVE_FIRST_HALF":
      return "First half";
    case "HALF_TIME":
      return "Half-time";
    case "LIVE_SECOND_HALF":
      return "Second half";
    case "FULL_TIME":
      return "Full-time";
    case "POSTPONED":
      return "Postponed";
    case "CANCELLED":
      return "Cancelled";
    case "ABANDONED":
      return "Abandoned";
  }
}

export const HALF_LENGTH_MINUTES = 45;

export interface MatchClock {
  minute: number;
  addedTime: number;
}

/**
 * Derive the running match minute from when the current period started.
 * Minute counting follows football convention: the first minute is "1'",
 * and time beyond the regulation half is shown as stoppage ("45+2'").
 */
export function computeMatchClock(
  status: MatchStatus,
  periodStartedAt: string | null,
  now: number,
): MatchClock | null {
  if (!isClockRunning(status) || !periodStartedAt) return null;
  const started = Date.parse(periodStartedAt);
  if (Number.isNaN(started)) return null;
  const elapsed = Math.max(0, Math.floor((now - started) / 60_000));
  const offset = status === "LIVE_SECOND_HALF" ? HALF_LENGTH_MINUTES : 0;
  const regulationEnd = offset + HALF_LENGTH_MINUTES;
  const minute = offset + elapsed + 1;
  if (minute > regulationEnd) {
    return { minute: regulationEnd, addedTime: minute - regulationEnd };
  }
  return { minute, addedTime: 0 };
}

export function formatMinute(minute: number, addedTime = 0): string {
  return addedTime > 0 ? `${minute}+${addedTime}'` : `${minute}'`;
}
