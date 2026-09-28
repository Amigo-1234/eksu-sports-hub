/**
 * Operator engine journey test. Run: npm run test:operator
 * Pure logic only — no React, storage or network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand, computeScore, lastUndoable, type CommandInput } from "../src/lib/operator/engine.ts";
import { availableCommands, nextPeriodCommand } from "../src/lib/operator/machine.ts";
import { displayClock, initialClock } from "../src/lib/operator/clock.ts";
import type { OpMatchState } from "../src/lib/operator/types.ts";

const T0 = Date.UTC(2026, 8, 28, 15, 0, 0);
const MIN = 60_000;
let seq = 0;
const newId = () => `id-${++seq}`;

function run(s: OpMatchState, input: CommandInput, now: number): OpMatchState {
  const r = applyCommand(s, input, { now, newId, intentId: newId() });
  assert.ok(r.ok, `expected ${input.command} to succeed: ${!r.ok ? r.reason : ""}`);
  return r.state;
}
function reject(s: OpMatchState, input: CommandInput, now: number): string {
  const r = applyCommand(s, input, { now, newId, intentId: null });
  assert.equal(r.ok, false, `expected ${input.command} to be rejected`);
  return (r as { reason: string }).reason;
}
const scored = (s: OpMatchState) => computeScore(s);

test("full operator journey keeps score equal to non-voided scoring events", () => {
  let s: OpMatchState = { matchId: "m1", phase: "SCHEDULED", clock: initialClock(), events: [], log: [], version: 0 };

  assert.deepEqual([...availableCommands(s)], ["START_MATCH"]);
  reject(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: 9 } }, T0);

  s = run(s, { command: "START_MATCH" }, T0);
  assert.equal(s.phase, "FIRST_HALF");
  assert.equal(nextPeriodCommand(s), "END_PERIOD");

  // Goal at 10:30 → 11'
  s = run(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: 9 } }, T0 + 10.5 * MIN);
  assert.equal(s.events.at(-1)!.minute, 11);
  assert.deepEqual(scored(s), { home: 1, away: 0 });

  // Accidental double tap is rejected.
  const dup = reject(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: 9 } }, T0 + 10.5 * MIN + 800);
  assert.match(dup, /duplicate/);

  // Card, substitution.
  s = run(s, { command: "RECORD_EVENT", event: { type: "YELLOW_CARD", side: "away", shirt: 4 } }, T0 + 20 * MIN);
  reject(s, { command: "RECORD_EVENT", event: { type: "YELLOW_CARD", side: "away", shirt: 4 } }, T0 + 30 * MIN);
  reject(s, { command: "RECORD_EVENT", event: { type: "SECOND_YELLOW", side: "away", shirt: 5 } }, T0 + 30 * MIN);
  s = run(s, { command: "RECORD_EVENT", event: { type: "SUBSTITUTION", side: "home", shirt: 7, shirtIn: 14 } }, T0 + 25 * MIN);
  reject(s, { command: "RECORD_EVENT", event: { type: "SUBSTITUTION", side: "home", shirt: 14, shirtIn: 7 } }, T0 + 26 * MIN);

  // Away goal, then undo it: voided, not deleted.
  s = run(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "away", shirt: 10 } }, T0 + 30 * MIN);
  assert.deepEqual(scored(s), { home: 1, away: 1 });
  const last = lastUndoable(s)!;
  s = run(s, { command: "VOID_EVENT", eventId: last.id, reason: "Undo" }, T0 + 30.2 * MIN);
  assert.equal(s.events.length, 4);
  assert.ok(s.events.at(-1)!.voided);
  assert.deepEqual(scored(s), { home: 1, away: 0 });

  // Stoppage is display-only.
  const before = displayClock(s.clock, T0 + 44 * MIN).mmss;
  s = run(s, { command: "SET_STOPPAGE", minutes: 2 }, T0 + 44 * MIN);
  assert.equal(displayClock(s.clock, T0 + 44 * MIN).mmss, before);
  assert.equal(displayClock(s.clock, T0 + 44 * MIN).announcedMinutes, 2);

  // Pause 3 minutes at 45:30; clock freezes and resumes without jumping.
  s = run(s, { command: "PAUSE", reason: "INJURY" }, T0 + 45.5 * MIN);
  reject(s, { command: "PAUSE", reason: "INJURY" }, T0 + 46 * MIN);
  const paused = displayClock(s.clock, T0 + 48 * MIN);
  assert.equal(paused.mmss, "45:30");
  assert.equal(paused.label, "45+1'");
  assert.ok(paused.paused);
  s = run(s, { command: "RESUME" }, T0 + 48.5 * MIN);
  assert.equal(displayClock(s.clock, T0 + 49.5 * MIN).mmss, "46:30");

  // Half-time: clock frozen, recording blocked.
  s = run(s, { command: "END_PERIOD" }, T0 + 50 * MIN);
  assert.equal(s.phase, "HALF_TIME");
  const htClock = displayClock(s.clock, T0 + 60 * MIN).mmss;
  assert.equal(htClock, displayClock(s.clock, T0 + 64 * MIN).mmss);
  assert.match(reject(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: 9 } }, T0 + 55 * MIN), /half-time/);
  reject(s, { command: "FINALISE_MATCH", confirmedScore: { home: 1, away: 0 } }, T0 + 55 * MIN);
  assert.equal(nextPeriodCommand(s), "START_PERIOD");

  // Second half begins from 45:00 baseline.
  s = run(s, { command: "START_PERIOD" }, T0 + 65 * MIN);
  assert.equal(displayClock(s.clock, T0 + 65 * MIN).label, "46'");
  assert.equal(displayClock(s.clock, T0 + 65 * MIN).announcedMinutes, 0);
  s = run(s, { command: "RECORD_EVENT", event: { type: "OWN_GOAL", side: "away", shirt: 3 } }, T0 + 80 * MIN);
  assert.deepEqual(scored(s), { home: 2, away: 0 });
  assert.equal(displayClock(s.clock, T0 + 112 * MIN).label, "90+3'");

  // Full-time needs the confirmed score to match.
  reject(s, { command: "FINALISE_MATCH", confirmedScore: { home: 1, away: 0 } }, T0 + 113 * MIN);
  s = run(s, { command: "FINALISE_MATCH", confirmedScore: { home: 2, away: 0 } }, T0 + 113 * MIN);
  assert.equal(s.phase, "FULL_TIME");
  assert.equal(availableCommands(s).size, 0);
  reject(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: 9 } }, T0 + 114 * MIN);
  reject(s, { command: "VOID_EVENT", eventId: s.events[0].id, reason: "x" }, T0 + 114 * MIN);
  assert.equal(displayClock(s.clock, T0 + 200 * MIN).mmss, displayClock(s.clock, T0 + 113 * MIN).mmss);

  // Score equals non-voided scoring events throughout.
  const active = s.events.filter((e) => !e.voided && ["GOAL", "PENALTY_GOAL", "OWN_GOAL"].includes(e.type));
  assert.equal(active.length, scored(s).home + scored(s).away);
});

test("admin-only outcomes are never offered to operators", () => {
  const s: OpMatchState = { matchId: "m2", phase: "FIRST_HALF", clock: initialClock(), events: [], log: [], version: 0 };
  const ops = availableCommands(s);
  assert.ok(!ops.has("ABANDON"));
  assert.ok(availableCommands(s, "admin").has("ABANDON"));
});
