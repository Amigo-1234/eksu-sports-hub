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
/** Normal extra-time halves are 15:00. */
export const ET_HALF_SECONDS = 15 * 60;

export type Period = 1 | 2 | 3 | 4 | 5;

/** Length of the halves for a match (seconds), from the competition's setting. */
export interface MatchDurations {
  halfSeconds: number;
  etHalfSeconds: number;
}
export const STANDARD_DURATIONS: MatchDurations = { halfSeconds: HALF_SECONDS, etHalfSeconds: ET_HALF_SECONDS };

/** Match-clock second at which a period starts: 0 / H / 2H / 2H+E / 2H+2E (5 = shoot-out). */
export function periodOffset(period: Period, d: MatchDurations = STANDARD_DURATIONS): number {
  const h = d.halfSeconds;
  const e = d.etHalfSeconds;
  return { 1: 0, 2: h, 3: 2 * h, 4: 2 * h + e, 5: 2 * h + 2 * e }[period];
}

export function periodLengthSeconds(period: Period | null, d: MatchDurations = STANDARD_DURATIONS): number {
  return period === 3 || period === 4 ? d.etHalfSeconds : period === 5 ? 0 : d.halfSeconds;
}

/** "45:00" / "7:30" — a duration in match-clock notation. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function toPeriod(n: number | null | undefined): Period | null {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 ? n : null;
}

export interface ClockState extends MatchDurations {
  /** 1–2 (halves), 3–4 (extra time), 5 (shoot-out) once the match has started. */
  period: Period | null;
  /** Clock second at the start of the period: 0 for 1H, one half length for 2H (45:00 normally), … */
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

export const initialClock = (d: MatchDurations = STANDARD_DURATIONS): ClockState => ({
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

export function startPeriodClock(period: Period, now: number, d: MatchDurations = STANDARD_DURATIONS): ClockState {
  return {
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
  /** Football minute: 1-based, capped at the regulation end of the period (rounded up: a 7:30 half ends in 8'). */
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
  const regulationEndMinute = Math.ceil((c.periodOffsetSeconds + periodLengthSeconds(c.period, c)) / 60);
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
