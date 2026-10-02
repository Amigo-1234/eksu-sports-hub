/**
 * Knockout football in the operator engine: extra time and penalty
 * shoot-outs, mirroring the database rules. Run: npm run test:operator
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand, computeScore, type CommandInput } from "../src/lib/operator/engine.ts";
import { availableCommands, endPeriodTarget, nextPeriodCommand } from "../src/lib/operator/machine.ts";
import { displayClock, initialClock } from "../src/lib/operator/clock.ts";
import { shootoutTally } from "../src/lib/operator/score.ts";
import { fromCanonical, type CanonicalState } from "../src/lib/operator/canonical.ts";
import type { MatchRules, OpMatchState } from "../src/lib/operator/types.ts";

const T0 = Date.UTC(2026, 10, 20, 15, 0, 0);
const MIN = 60_000;
let seq = 0;
const newId = () => `k-${++seq}`;

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
const knockout: MatchRules = { needsWinner: true, extraTime: true, penalties: true };

/** A match at the end of 90 minutes with the given score. */
function after90(rules: MatchRules | undefined, home: number, away: number): OpMatchState {
  let s: OpMatchState = { matchId: "ko", phase: "SCHEDULED", clock: initialClock(), events: [], log: [], version: 0, ...(rules ? { rules } : {}) };
  s = run(s, { command: "START_MATCH" }, T0);
  for (let i = 0; i < home; i++) s = run(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "home", shirt: null } }, T0 + (5 + i * 5) * MIN);
  s = run(s, { command: "END_PERIOD" }, T0 + 46 * MIN);
  s = run(s, { command: "START_PERIOD" }, T0 + 60 * MIN);
  for (let i = 0; i < away; i++) s = run(s, { command: "RECORD_EVENT", event: { type: "GOAL", side: "away", shirt: null } }, T0 + (65 + i * 5) * MIN);
  return s;
}

test("league matches: a level score after 90 minutes is final (no extra time)", () => {
  const s = after90(undefined, 1, 1);
  assert.equal(nextPeriodCommand(s), "FINALISE_MATCH");
  assert.equal(availableCommands(s).has("END_PERIOD"), false);
  reject(s, { command: "END_PERIOD" }, T0 + 106 * MIN);
});

test("knockout: a decided match ends after 90 minutes", () => {
  const s = after90(knockout, 2, 1);
  assert.equal(nextPeriodCommand(s), "FINALISE_MATCH");
  assert.equal(endPeriodTarget(s), null);
});

test("knockout: level after 90 → extra time → penalties → winner", () => {
  let s = after90(knockout, 1, 1);
  assert.equal(nextPeriodCommand(s), "END_PERIOD", "level knockout continues instead of ending");
  assert.equal(availableCommands(s).has("FINALISE_MATCH"), false);
  reject(s, { command: "FINALISE_MATCH", confirmedScore: { home: 1, away: 1 } }, T0 + 106 * MIN);

  s = run(s, { command: "END_PERIOD" }, T0 + 106 * MIN);
  assert.equal(s.phase, "ET_BREAK");
  assert.equal(availableCommands(s).has("RECORD_EVENT"), false);
  s = run(s, { command: "START_PERIOD" }, T0 + 110 * MIN);
  assert.equal(s.phase, "EXTRA_TIME_FIRST");
  assert.equal(s.clock.period, 3);
  assert.equal(s.clock.periodOffsetSeconds, 5400);
  assert.equal(displayClock(s.clock, T0 + 112 * MIN).label, "93'");
  // ET halves are 15 minutes: 16 minutes in → 105+2'.
  assert.equal(displayClock(s.clock, T0 + 126 * MIN).label, "105+2'");

  s = run(s, { command: "END_PERIOD" }, T0 + 126 * MIN);
  assert.equal(s.phase, "ET_BREAK");
  s = run(s, { command: "START_PERIOD" }, T0 + 128 * MIN);
  assert.equal(s.phase, "EXTRA_TIME_SECOND");
  assert.equal(s.clock.periodOffsetSeconds, 6300);
  reject(s, { command: "FINALISE_MATCH", confirmedScore: { home: 1, away: 1 } }, T0 + 144 * MIN);

  s = run(s, { command: "END_PERIOD" }, T0 + 144 * MIN);
  assert.equal(s.phase, "PENALTIES");
  assert.equal(availableCommands(s).has("RECORD_EVENT"), false, "no match events during a shoot-out");

  const kick = (side: "home" | "away", outcome: "SCORED" | "MISSED" | "SAVED", t: number) =>
    (s = run(s, { command: "RECORD_KICK", kick: { side, outcome, shirt: null } }, T0 + t * MIN));
  kick("home", "SCORED", 150);
  reject(s, { command: "RECORD_KICK", kick: { side: "home", outcome: "SCORED", shirt: null } }, T0 + 150 * MIN);
  kick("away", "SCORED", 151);
  kick("home", "SAVED", 152);
  kick("away", "SCORED", 153);
  kick("home", "SCORED", 154);
  kick("away", "MISSED", 155);
  kick("home", "SCORED", 156);
  kick("away", "SCORED", 157);
  assert.equal(availableCommands(s).has("FINALISE_MATCH"), false, "not decided yet");
  kick("home", "SCORED", 158);
  kick("away", "SAVED", 159); // home 4, away 3 after five each
  const t = shootoutTally(s.kicks);
  assert.deepEqual([t.homeScored, t.awayScored, t.decided, t.winner], [4, 3, true, "home"]);
  assert.equal(availableCommands(s).has("RECORD_KICK"), false, "locked once decided");
  assert.deepEqual(computeScore(s), { home: 1, away: 1 }, "kicks never change the match score");

  s = run(s, { command: "FINALISE_MATCH", confirmedScore: { home: 1, away: 1 } }, T0 + 160 * MIN);
  assert.equal(s.phase, "FULL_TIME");
});

test("penalties without extra time; sudden death; undo", () => {
  let s = after90({ needsWinner: true, extraTime: false, penalties: true }, 0, 0);
  s = run(s, { command: "END_PERIOD" }, T0 + 106 * MIN);
  assert.equal(s.phase, "PENALTIES", "straight to penalties when extra time is off");
  for (let i = 0; i < 5; i++) {
    s = run(s, { command: "RECORD_KICK", kick: { side: "home", outcome: "SCORED", shirt: null } }, T0 + (110 + i) * MIN);
    s = run(s, { command: "RECORD_KICK", kick: { side: "away", outcome: "SCORED", shirt: null } }, T0 + (110 + i) * MIN);
  }
  assert.equal(shootoutTally(s.kicks).decided, false, "5–5: sudden death");
  s = run(s, { command: "RECORD_KICK", kick: { side: "home", outcome: "MISSED", shirt: null } }, T0 + 120 * MIN);
  assert.equal(shootoutTally(s.kicks).decided, false, "away still to kick");
  const last = s.kicks!.at(-1)!;
  s = run(s, { command: "VOID_KICK", kickId: last.id, reason: "Wrong team" }, T0 + 121 * MIN);
  assert.equal(shootoutTally(s.kicks).homeTaken, 5, "voided kick removed from the tally");
  s = run(s, { command: "RECORD_KICK", kick: { side: "home", outcome: "SCORED", shirt: null } }, T0 + 122 * MIN);
  s = run(s, { command: "RECORD_KICK", kick: { side: "away", outcome: "SAVED", shirt: null } }, T0 + 123 * MIN);
  const t = shootoutTally(s.kicks);
  assert.deepEqual([t.homeScored, t.awayScored, t.winner], [6, 5, "home"]);
});

test("early decision in the first five kicks", () => {
  assert.equal(shootoutTally([
    { id: "1", side: "home", shirt: null, outcome: "SCORED", voided: null, intentId: null },
    { id: "2", side: "away", shirt: null, outcome: "MISSED", voided: null, intentId: null },
    { id: "3", side: "home", shirt: null, outcome: "SCORED", voided: null, intentId: null },
    { id: "4", side: "away", shirt: null, outcome: "MISSED", voided: null, intentId: null },
    { id: "5", side: "home", shirt: null, outcome: "SCORED", voided: null, intentId: null },
    { id: "6", side: "away", shirt: null, outcome: "MISSED", voided: null, intentId: null },
  ]).decided, true, "3–0 after three each cannot be caught");
});

test("canonical state maps extra time, rules and kicks", () => {
  const c: CanonicalState = {
    match: {
      id: "m", status: "PENS", home_team_id: "H", away_team_id: "A", home_score: 2, away_score: 2, seq: 40,
      current_period: 5, period_started_at: new Date(T0).toISOString(), period_ended_at: new Date(T0).toISOString(),
      period_offset_seconds: 7200, clock_running: false, paused_at: null, accumulated_pause_seconds: 0, stoppage_seconds: 0,
    },
    events: [],
    rules: { needs_winner: true, extra_time: true, penalties: true },
    shootout: {
      home_taken: 1, away_taken: 0, home_scored: 1, away_scored: 0, decided: false, winner_team_id: null,
      kicks: [{ id: "x", seq: 41, team_id: "H", outcome: "SCORED", player_id: null, shirt_number: 7, recorded_at: new Date(T0).toISOString(), voided_at: null, void_reason: null }],
    },
  };
  const s = fromCanonical(c);
  assert.equal(s.phase, "PENALTIES");
  assert.equal(s.clock.period, 5);
  assert.deepEqual(s.rules, { needsWinner: true, extraTime: true, penalties: true });
  assert.equal(s.kicks?.[0].side, "home");
  assert.equal(s.kicks?.[0].shirt, 7);
  assert.equal(fromCanonical({ ...c, match: { ...c.match, status: "ET1", current_period: 3 } }).phase, "EXTRA_TIME_FIRST");
});
