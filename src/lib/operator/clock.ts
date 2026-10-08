/**
 * Match clock derived from timestamps — never from a counter that ticks.
 *
 * Elapsed time for the current period is:
 *   periodOffsetSeconds
 *   + (periodEndedAt ?? now) − periodStartedAt
 *   − accumulatedPauseSeconds − (ongoing pause)
 *
 * All functions take `now` (ms) explicitly, so a server-time offset can be
 * applied by the caller (see `time.ts`) without touching this module.
 */

/** Normal football: 45:00 halves. Competitions can set their own (e.g. 7:30). */
export const HALF_SECONDS = 45 * 60;
/** Extra-time halves (kept for compatibility; not used by league matches). */
export const ET_HALF_SECONDS = 15 * 60;

/** Length of the halves for a match (seconds), from the competition's setting. */
export interface MatchDurations {
  halfSeconds: number;
  etHalfSeconds: number;
}
export const STANDARD_DURATIONS: MatchDurations = { halfSeconds: HALF_SECONDS, etHalfSeconds: ET_HALF_SECONDS };

/** Match-clock second at which a period starts: 0 / H / 2H / 2H+E / 2H+2E. */
export function periodOffset(period: number, d: MatchDurations = STANDARD_DURATIONS): number {
  const h = d.halfSeconds;
  const e = d.etHalfSeconds;
  return period === 1 ? 0 : period === 2 ? h : period === 3 ? 2 * h : period === 4 ? 2 * h + e : 2 * h + 2 * e;
}

export function periodLengthSeconds(period: number | null, d: MatchDurations = STANDARD_DURATIONS): number {
  return period === 3 || period === 4 ? d.etHalfSeconds : period === 5 ? 0 : d.halfSeconds;
}

/** "45:00" / "7:30" — a duration in match-clock notation. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface ClockState extends MatchDurations {
  /** 1 or 2 once the match has started. */
  period: 1 | 2 | null;
  /** Clock second at the start of the period: 0 for 1H, one half length for 2H (45:00 normally). */
  periodOffsetSeconds: number;
  /** Wall-clock start of the current period (ms). */
  periodStartedAt: number | null;
  /** Wall-clock end of the current period (ms), once ended. */
  periodEndedAt: number | null;
  clockRunning: boolean;
  /** Set while paused (ms). */
  pausedAt: number | null;
  /** Total completed pause time in this period. */
  accumulatedPauseSeconds: number;
  /** Announced stoppage for this period. Display only — never alters elapsed time. */
  stoppageSeconds: number;
  /** Special rules: no added time — the display stops at the regulation end of the period. */
  noAddedTime?: boolean;
  /** Active playing time (s) of the periods already ended (server: active_base_seconds). */
  activeBaseSeconds?: number;
}

/** Settings a clock carries from one period to the next. */
type Carry = MatchDurations & Partial<Pick<ClockState, "noAddedTime" | "activeBaseSeconds">>;
const carry = (d: Carry) => ({
  ...(d.noAddedTime ? { noAddedTime: true } : {}),
  ...(d.activeBaseSeconds !== undefined ? { activeBaseSeconds: d.activeBaseSeconds } : {}),
});

export const initialClock = (d: Carry = STANDARD_DURATIONS): ClockState => ({
  ...carry(d),
  halfSeconds: d.halfSeconds,
  etHalfSeconds: d.etHalfSeconds,
  period: null,
  periodOffsetSeconds: 0,
  periodStartedAt: null,
  periodEndedAt: null,
  clockRunning: false,
  pausedAt: null,
  accumulatedPauseSeconds: 0,
  stoppageSeconds: 0,
});

export function startPeriodClock(period: 1 | 2, now: number, d: Carry = STANDARD_DURATIONS): ClockState {
  return {
    ...carry(d),
    halfSeconds: d.halfSeconds,
    etHalfSeconds: d.etHalfSeconds,
    period,
    periodOffsetSeconds: periodOffset(period, d),
    periodStartedAt: now,
    periodEndedAt: null,
    clockRunning: true,
    pausedAt: null,
    accumulatedPauseSeconds: 0,
    stoppageSeconds: 0,
  };
}

export function pauseClock(c: ClockState, now: number): ClockState {
  if (!c.clockRunning || c.pausedAt !== null) return c;
  return { ...c, pausedAt: now };
}

export function resumeClock(c: ClockState, now: number): ClockState {
  if (c.pausedAt === null) return c;
  return {
    ...c,
    pausedAt: null,
    accumulatedPauseSeconds: c.accumulatedPauseSeconds + Math.max(0, (now - c.pausedAt) / 1000),
  };
}

/** Freeze the clock at the end of a period (folds any open pause in first). */
export function stopClock(c: ClockState, now: number): ClockState {
  const resumed = resumeClock(c, now);
  const played = c.periodEndedAt === null ? elapsedSeconds(resumed, now) - c.periodOffsetSeconds : 0;
  return {
    ...resumed,
    clockRunning: false,
    periodEndedAt: now,
    ...(c.activeBaseSeconds !== undefined ? { activeBaseSeconds: c.activeBaseSeconds + Math.max(0, played) } : {}),
  };
}

export function setStoppage(c: ClockState, seconds: number): ClockState {
  return { ...c, stoppageSeconds: Math.max(0, Math.round(seconds)) };
}

/** Seconds of match time (football baseline) at `now`. */
export function elapsedSeconds(c: ClockState, now: number): number {
  if (c.periodStartedAt === null) return c.periodOffsetSeconds;
  const end = c.periodEndedAt ?? now;
  const openPause = c.pausedAt !== null ? Math.max(0, (end - c.pausedAt) / 1000) : 0;
  const inPeriod = (end - c.periodStartedAt) / 1000 - c.accumulatedPauseSeconds - openPause;
  return c.periodOffsetSeconds + Math.max(0, inPeriod);
}

export interface ClockDisplay {
  /** Football minute: 1-based, capped at the regulation end of the period. */
  minute: number;
  /** Minutes beyond regulation (45+2 → 2). */
  addedTime: number;
  /** "67'" / "45+2'" — the public display string. */
  label: string;
  /** "67:12" — precise operator display. */
  mmss: string;
  /** Announced stoppage in whole minutes (0 if none). */
  announcedMinutes: number;
  paused: boolean;
  /** The regulation time of the period has been reached (the operator ends the half). */
  timeUp: boolean;
}

export function displayClock(c: ClockState, now: number): ClockDisplay {
  const regulationEnd = c.periodOffsetSeconds + periodLengthSeconds(c.period, c);
  const timeUp = c.period !== null && elapsedSeconds(c, now) >= regulationEnd;
  // No added time: the clock shown stops at the regulation end (8:00, 16:00).
  const elapsed = c.noAddedTime ? Math.min(elapsedSeconds(c, now), regulationEnd) : elapsedSeconds(c, now);
  // Rounded up: a 7:30 half ends in the 8th minute (added time from 8:00 → 8+1').
  const regulationEndMinute = Math.ceil(regulationEnd / 60);
  const rawMinute = Math.min(Math.floor(elapsed / 60) + 1, c.noAddedTime ? regulationEndMinute : Infinity);
  const over = rawMinute > regulationEndMinute;
  const minute = over ? regulationEndMinute : rawMinute;
  const addedTime = over ? rawMinute - regulationEndMinute : 0;
  const whole = Math.floor(elapsed);
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return {
    minute,
    addedTime,
    label: addedTime > 0 ? `${minute}+${addedTime}'` : `${minute}'`,
    mmss: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    announcedMinutes: Math.round(c.stoppageSeconds / 60),
    paused: c.pausedAt !== null,
    timeUp,
  };
}

/**
 * Active playing time (s) at `now`: ended periods in full plus the running
 * period, pauses and half-time excluded — the clock a temporary suspension
 * is served on (mirrors private.active_seconds_now).
 */
export function activeSeconds(c: ClockState, now: number): number {
  const base = c.activeBaseSeconds ?? 0;
  if (c.periodStartedAt === null || c.periodEndedAt !== null) return base;
  return base + Math.max(0, elapsedSeconds(c, now) - c.periodOffsetSeconds);
}
