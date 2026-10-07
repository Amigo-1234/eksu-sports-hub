/**
 * Configurable match length in the operator clock: a short 2 × 7:30 format
 * next to the normal 45:00 halves. Run: npm run test:operator
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand, type CommandInput } from "../src/lib/operator/engine.ts";
import { displayClock, formatDuration, initialClock, periodOffset, STANDARD_DURATIONS } from "../src/lib/operator/clock.ts";
import { clockFromCanonical, type CanonicalMatch } from "../src/lib/operator/canonical.ts";
import { computePublicClock } from "../src/lib/status.ts";
import type { OpMatchState } from "../src/lib/operator/types.ts";

const T0 = Date.UTC(2026, 10, 21, 15, 0, 0);
const SEC = 1000;
const SHORT = { halfSeconds: 450, etHalfSeconds: 900 };
let seq = 0;
const newId = () => `d-${++seq}`;

function run(s: OpMatchState, input: CommandInput, now: number): OpMatchState {
  const r = applyCommand(s, input, { now, newId, intentId: newId() });
  assert.ok(r.ok, `expected ${input.command} to succeed: ${!r.ok ? r.reason : ""}`);
  return r.state;
}
const fresh = (d = SHORT): OpMatchState => ({ matchId: "s", phase: "SCHEDULED", clock: initialClock(d), events: [], log: [], version: 0 });
const label = (s: OpMatchState, at: number) => displayClock(s.clock, at).label;

test("normal football offsets and labels are unchanged", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((p) => periodOffset(p as 1, STANDARD_DURATIONS)), [0, 2700, 5400, 6300, 7200]);
  let s = run(fresh(STANDARD_DURATIONS), { command: "START_MATCH" }, T0);
  assert.equal(label(s, T0 + 44 * 60 * SEC + 59 * SEC), "45'");
  assert.equal(label(s, T0 + 45 * 60 * SEC), "45+1'");
  s = run(s, { command: "END_PERIOD" }, T0 + 47 * 60 * SEC);
  s = run(s, { command: "START_PERIOD" }, T0 + 60 * 60 * SEC);
  assert.equal(s.clock.periodOffsetSeconds, 2700);
  assert.equal(label(s, T0 + 60 * 60 * SEC), "46'");
  assert.equal(label(s, T0 + 105 * 60 * SEC), "90+1'");
});

test("short format: 2 × 7:30 — offsets, half-time and full-time points", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((p) => periodOffset(p as 1, SHORT)), [0, 450, 900, 1800, 2700]);
  assert.equal(formatDuration(450), "7:30");
  assert.equal(formatDuration(900), "15:00");
});

test("short format: first-half minute labels follow football convention", () => {
  const s = run(fresh(), { command: "START_MATCH" }, T0);
  assert.equal(displayClock(s.clock, T0).mmss, "00:00");
  assert.equal(label(s, T0), "1'");
  assert.equal(label(s, T0 + 59 * SEC), "1'");
  assert.equal(label(s, T0 + 60 * SEC), "2'");
  assert.equal(label(s, T0 + 7 * 60 * SEC), "8'"); // 7:00–7:29 is the 8th minute
  assert.equal(label(s, T0 + 449 * SEC), "8'");
  assert.equal(label(s, T0 + 450 * SEC), "8'"); // half-time point 7:30 — still the 8th minute
  assert.equal(label(s, T0 + 480 * SEC), "8+1'"); // past 8:00: added time
  assert.equal(displayClock(s.clock, T0 + 450 * SEC).mmss, "07:30");
});

test("short format: second half starts from 7:30 and full time is 15:00", () => {
  let s = run(fresh(), { command: "START_MATCH" }, T0);
  s = run(s, { command: "END_PERIOD" }, T0 + 455 * SEC);
  assert.equal(s.phase, "HALF_TIME");
  // Half-time can last any time (no fixed interval): restart 3 minutes later.
  const restart = T0 + 635 * SEC;
  s = run(s, { command: "START_PERIOD" }, restart);
  assert.equal(s.clock.period, 2);
  assert.equal(s.clock.periodOffsetSeconds, 450);
  assert.equal(displayClock(s.clock, restart).mmss, "07:30");
  assert.equal(label(s, restart), "8'");
  assert.equal(label(s, restart + 30 * SEC), "9'"); // 8:00
  assert.equal(label(s, restart + 449 * SEC), "15'"); // 14:59
  assert.equal(label(s, restart + 450 * SEC), "15+1'"); // 15:00 full-time point
  assert.equal(displayClock(s.clock, restart + 450 * SEC).mmss, "15:00");
});

test("short format: events take the label at the moment they are recorded", () => {
  let s = run(fresh(), { command: "START_MATCH" }, T0);
  s = run(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: null } }, T0 + 437 * SEC); // 7:17
  assert.equal(s.events[0].minute, 8);
  assert.equal(s.events[0].addedTime ?? 0, 0);
  s = run(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "away", shirt: null } }, T0 + 500 * SEC); // 8:20
  assert.equal(s.events[1].minute, 8);
  assert.equal(s.events[1].addedTime, 1);
});

test("pausing does not count towards a short half", () => {
  let s = run(fresh(), { command: "START_MATCH" }, T0);
  s = run(s, { command: "PAUSE", reason: "INJURY" }, T0 + 100 * SEC);
  s = run(s, { command: "RESUME" }, T0 + 160 * SEC);
  assert.equal(displayClock(s.clock, T0 + 160 * SEC).mmss, "01:40");
});

test("server state carries the match length into the operator and public clocks", () => {
  const m = {
    id: "s", status: "2H", home_team_id: "h", away_team_id: "a", home_score: 0, away_score: 0, seq: 1,
    current_period: 2, period_started_at: new Date(T0).toISOString(), period_ended_at: null, period_offset_seconds: 450,
    clock_running: true, paused_at: null, accumulated_pause_seconds: 0, stoppage_seconds: 0, half_seconds: 450, et_half_seconds: 900,
  } as unknown as CanonicalMatch;
  const c = clockFromCanonical(m);
  assert.equal(c.halfSeconds, 450);
  assert.equal(displayClock(c, T0 + 449 * SEC).label, "15'");
  const pub = computePublicClock("LIVE_SECOND_HALF", {
    period: 2, periodStartedAt: new Date(T0).toISOString(), periodEndedAt: null, periodOffsetSeconds: 450, clockRunning: true,
    pausedAt: null, accumulatedPauseSeconds: 0, stoppageSeconds: 0, halfSeconds: 450, etHalfSeconds: 900,
  }, T0 + 460 * SEC);
  assert.deepEqual([pub?.minute, pub?.addedTime], [15, 1]);
  // Older rows without half_seconds fall back to 45:00 halves.
  const legacy = clockFromCanonical({ ...m, half_seconds: undefined, period_offset_seconds: 2700 } as unknown as CanonicalMatch);
  assert.equal(legacy.halfSeconds, 2700);
});
