/**
 * Time source for the operator console. Components never call Date.now()
 * directly; when the backend exists, set the measured server offset here and
 * every clock display follows.
 */
let serverOffsetMs = 0;

export function setServerOffset(ms: number) {
  serverOffsetMs = ms;
}

export function now(): number {
  return Date.now() + serverOffsetMs;
}
