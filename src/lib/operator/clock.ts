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

export const HALF_SECONDS = 45 * 60;

export interface ClockState {
  /** 1 or 2 once the match has started. */
  period: 1 | 2 | null;
  /** Football baseline for the period: 0 for 1H, 2700 (45:00) for 2H. */
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
}

export const initialClock = (): ClockState => ({
  period: null,
  periodOffsetSeconds: 0,
  periodStartedAt: null,
  periodEndedAt: null,
  clockRunning: false,
  pausedAt: null,
  accumulatedPauseSeconds: 0,
  stoppageSeconds: 0,
});

export function startPeriodClock(period: 1 | 2, now: number): ClockState {
  return {
    period,
    periodOffsetSeconds: period === 1 ? 0 : HALF_SECONDS,
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
  return { ...resumed, clockRunning: false, periodEndedAt: now };
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
}

export function displayClock(c: ClockState, now: number): ClockDisplay {
  const elapsed = elapsedSeconds(c, now);
  const regulationEndMinute = (c.periodOffsetSeconds + HALF_SECONDS) / 60;
  const rawMinute = Math.floor(elapsed / 60) + 1;
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
  };
}
