/**
 * Special competition rules in the operator console and public views:
 * 2 × 8:00 without added time, rolling substitutions with re-entry, 60 s
 * temporary red cards on active playing time, approved returns, exclusion —
 * and normal football unchanged. Run: npm run test:operator
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommand, playerStatuses, suspensionRemaining, type CommandInput } from "../src/lib/operator/engine.ts";
import { activeSeconds, displayClock, initialClock } from "../src/lib/operator/clock.ts";
import { isAvailableSub, isOnField, type ConsolePlayer } from "../src/lib/operator/lineup.ts";
import { fromCanonical, type CanonicalState } from "../src/lib/operator/canonical.ts";
import { currentPitch } from "../src/lib/lineup.ts";
import { computePublicClock, publicActiveSeconds } from "../src/lib/status.ts";
import { halftimeRemaining, parseRegulations, parseSpecialRules, SIX_A_SIDE_NOVELTY_PRESET } from "../src/lib/rules/special.ts";
import type { OpMatchState } from "../src/lib/operator/types.ts";

const T0 = Date.UTC(2026, 10, 21, 15, 0, 0);
const SEC = 1000;
const RULES = parseSpecialRules(SIX_A_SIDE_NOVELTY_PRESET)!;
const EIGHT = { halfSeconds: 480, etHalfSeconds: 900 };
let seq = 0;
const newId = () => `s-${++seq}`;

function run(s: OpMatchState, input: CommandInput, now: number): OpMatchState {
  const r = applyCommand(s, input, { now, newId, intentId: newId() });
  assert.ok(r.ok, `expected ${input.command} to succeed: ${!r.ok ? r.reason : ""}`);
  return r.state;
}
function fails(s: OpMatchState, input: CommandInput, now: number, pattern: RegExp) {
  const r = applyCommand(s, input, { now, newId, intentId: newId() });
  assert.ok(!r.ok, `expected ${input.command} to be refused`);
  assert.match(r.reason, pattern);
}
const special = (): OpMatchState => ({
  matchId: "mz", phase: "SCHEDULED", clock: initialClock({ ...EIGHT, noAddedTime: true, activeBaseSeconds: 0 }),
  events: [], log: [], version: 0, rules: RULES,
});
const normal = (): OpMatchState => ({ matchId: "n", phase: "SCHEDULED", clock: initialClock(), events: [], log: [], version: 0 });
const ev = (type: string, shirt: number, extra: Record<string, unknown> = {}): CommandInput =>
  ({ command: "RECORD_EVENT", event: { type, side: "home", shirt, ...extra } }) as CommandInput;

test("preset parses into rules and public regulations", () => {
  assert.deepEqual(RULES, { starters: 6, noAddedTime: true, halftimeSeconds: 60, rollingSubs: true, redCardSuspensionSeconds: 60, offside: false });
  const regs = parseRegulations(SIX_A_SIDE_NOVELTY_PRESET)!;
  assert.equal(regs.items.length, 11);
  assert.equal(regs.items[0].title, "Match duration");
  assert.equal(parseSpecialRules(null), null);
  assert.equal(parseRegulations({ starters: 6 }), null);
});

test("no added time: the clock stops at 8:00 and 16:00, the operator is prompted", () => {
  let s = run(special(), { command: "START_MATCH" }, T0);
  const at = (t: number) => displayClock(s.clock, t);
  assert.deepEqual([at(T0 + 479 * SEC).label, at(T0 + 479 * SEC).timeUp], ["8'", false]);
  assert.deepEqual([at(T0 + 480 * SEC).mmss, at(T0 + 480 * SEC).timeUp], ["08:00", true]);
  assert.deepEqual([at(T0 + 530 * SEC).label, at(T0 + 530 * SEC).mmss], ["8'", "08:00"], "no 8+1'");
  fails(s, { command: "SET_STOPPAGE", minutes: 1 }, T0 + 400 * SEC, /no added time/);
  s = run(s, ev("GOAL", 9), T0 + 500 * SEC);
  assert.deepEqual([s.events[0].minute, s.events[0].addedTime], [8, 0], "late events are recorded at 8'");
  s = run(s, { command: "END_PERIOD" }, T0 + 505 * SEC);
  s = run(s, { command: "START_PERIOD" }, T0 + 565 * SEC);
  assert.equal(displayClock(s.clock, T0 + 565 * SEC).mmss, "08:00");
  assert.equal(displayClock(s.clock, T0 + 565 * SEC + 480 * SEC).label, "16'");
  assert.equal(displayClock(s.clock, T0 + 565 * SEC + 600 * SEC).label, "16'");
  // Normal football keeps added time.
  const n = run(normal(), { command: "START_MATCH" }, T0);
  assert.equal(displayClock(n.clock, T0 + 2700 * SEC).label, "45+1'");
});

test("public clock follows the match's rules", () => {
  const clock = {
    period: 1, periodStartedAt: new Date(T0).toISOString(), periodEndedAt: null, periodOffsetSeconds: 0, clockRunning: true,
    pausedAt: null, accumulatedPauseSeconds: 0, stoppageSeconds: 0, halfSeconds: 480, etHalfSeconds: 900, rules: RULES, activeBaseSeconds: 0,
  };
  assert.deepEqual(computePublicClock("LIVE_FIRST_HALF", clock, T0 + 540 * SEC), { minute: 8, addedTime: 0, paused: false });
  assert.equal(publicActiveSeconds(clock, T0 + 100 * SEC), 100);
  assert.equal(halftimeRemaining(RULES, T0, T0 + 15 * SEC), 45);
  assert.equal(halftimeRemaining(null, T0, T0), null);
});

test("rolling substitutions: unlimited, players may return", () => {
  let s = run(special(), { command: "START_MATCH" }, T0);
  s = run(s, ev("SUBSTITUTION", 2, { shirtIn: 7 }), T0 + 30 * SEC);
  s = run(s, ev("SUBSTITUTION", 7, { shirtIn: 2 }), T0 + 60 * SEC);
  s = run(s, ev("SUBSTITUTION", 3, { shirtIn: 7 }), T0 + 90 * SEC);
  const st = playerStatuses(s, "home");
  const starter = (n: number): ConsolePlayer => ({ shirt: n, name: null, role: n <= 6 ? "STARTER" : "SUBSTITUTE" });
  assert.equal(isOnField(starter(2), st.get(2)), true, "No. 2 came back on");
  assert.equal(isOnField(starter(3), st.get(3)), false);
  assert.equal(isOnField(starter(7), st.get(7)), true);
  assert.deepEqual([st.get(7)!.entries, st.get(7)!.exits], [2, 1]);
  assert.equal(isAvailableSub(starter(3), st.get(3), true), true, "a starter who went off may come back");
  assert.equal(isAvailableSub(starter(4), st.get(4), true), false, "players on the pitch are not offered");
  fails(s, ev("SUBSTITUTION", 4, { shirtIn: 2 }), T0 + 120 * SEC, /already on the pitch/);
  // Normal football: no re-entry.
  let n = run(normal(), { command: "START_MATCH" }, T0);
  n = run(n, ev("SUBSTITUTION", 2, { shirtIn: 12 }), T0 + 30 * SEC);
  fails(n, ev("SUBSTITUTION", 12, { shirtIn: 2 }), T0 + 60 * SEC, /can't return/);
});

test("temporary red card: 60 s of active play, approved return, pauses and half-time don't count", () => {
  let s = run(special(), { command: "START_MATCH" }, T0);
  s = run(s, ev("RED_CARD", 4), T0 + 450 * SEC); // 7:30
  let st = playerStatuses(s, "home").get(4);
  assert.equal(st?.suspended, true);
  assert.equal(st?.sentOff, false, "not a permanent dismissal");
  assert.equal(isOnField({ shirt: 4, name: null, role: "STARTER" }, st), false);
  assert.equal(suspensionRemaining(s, st, T0 + 450 * SEC), 60);
  fails(s, ev("SUSPENSION_RETURN", 4), T0 + 460 * SEC, /still has 0:50/);
  fails(s, ev("SUBSTITUTION", 4, { shirtIn: 8 }), T0 + 460 * SEC, /cannot be replaced/);
  fails(s, ev("GOAL", 4), T0 + 460 * SEC, /serving a suspension/);
  // A 30 s pause does not count.
  s = run(s, { command: "PAUSE", reason: "INJURY" }, T0 + 460 * SEC);
  assert.equal(suspensionRemaining(s, playerStatuses(s, "home").get(4), T0 + 490 * SEC), 50);
  s = run(s, { command: "RESUME" }, T0 + 490 * SEC);
  // Half-time at 8:00 of play: 30 s served, 30 s carry into the second half.
  s = run(s, { command: "END_PERIOD" }, T0 + 510 * SEC);
  assert.equal(activeSeconds(s.clock, T0 + 600 * SEC), 480, "half-time does not add playing time");
  assert.equal(suspensionRemaining(s, playerStatuses(s, "home").get(4), T0 + 570 * SEC), 30);
  s = run(s, { command: "START_PERIOD" }, T0 + 570 * SEC);
  st = playerStatuses(s, "home").get(4);
  assert.equal(suspensionRemaining(s, st, T0 + 580 * SEC), 20);
  assert.equal(suspensionRemaining(s, st, T0 + 600 * SEC), 0);
  assert.equal(isOnField({ shirt: 4, name: null, role: "STARTER" }, st), false, "no automatic return");
  s = run(s, ev("SUSPENSION_RETURN", 4), T0 + 600 * SEC);
  st = playerStatuses(s, "home").get(4);
  assert.equal(isOnField({ shirt: 4, name: null, role: "STARTER" }, st), true);
  assert.equal(st?.redCards, 1);
});

test("second yellow is a red-card incident; repeat incidents; permanent exclusion needs a reason", () => {
  let s = run(special(), { command: "START_MATCH" }, T0);
  s = run(s, ev("YELLOW_CARD", 5), T0 + 10 * SEC);
  fails(s, ev("YELLOW_CARD", 5), T0 + 20 * SEC, /already has a yellow/);
  s = run(s, ev("SECOND_YELLOW", 5), T0 + 20 * SEC);
  assert.equal(playerStatuses(s, "home").get(5)?.suspended, true);
  s = run(s, ev("SUSPENSION_RETURN", 5), T0 + 80 * SEC);
  s = run(s, ev("SECOND_YELLOW", 5), T0 + 90 * SEC);
  assert.deepEqual([playerStatuses(s, "home").get(5)?.redCards, playerStatuses(s, "home").get(5)?.suspended], [2, true]);
  fails(s, ev("EXCLUSION", 5), T0 + 95 * SEC, /reason/);
  s = run(s, ev("EXCLUSION", 5, { reason: "Repeated abusive language" }), T0 + 95 * SEC);
  const st = playerStatuses(s, "home").get(5);
  assert.deepEqual([st?.sentOff, st?.suspended], [true, false]);
  assert.equal(s.events.at(-1)?.reason, "Repeated abusive language");
  fails(s, ev("SUSPENSION_RETURN", 5), T0 + 200 * SEC, /excluded/);
  fails(s, ev("SUBSTITUTION", 9, { shirtIn: 5 }), T0 + 200 * SEC, /excluded/);
  // Normal football: a red card is permanent.
  let n = run(normal(), { command: "START_MATCH" }, T0);
  n = run(n, ev("RED_CARD", 4), T0 + 10 * SEC);
  assert.equal(playerStatuses(n, "home").get(4)?.sentOff, true);
});

test("canonical state carries the rules, active base and event active-play seconds", () => {
  const c = {
    match: {
      id: "mz", status: "2H", home_team_id: "h", away_team_id: "a", home_score: 0, away_score: 0, seq: 9, current_period: 2,
      period_started_at: new Date(T0).toISOString(), period_ended_at: null, period_offset_seconds: 480, half_seconds: 480, et_half_seconds: 900,
      clock_running: true, paused_at: null, accumulated_pause_seconds: 0, stoppage_seconds: 0,
      special_rules: { red_card_suspension_seconds: 60, rolling_subs: true, no_added_time: true }, active_base_seconds: 490,
    },
    events: [{ id: "r", seq: 1, type: "RED_CARD", period: 1, minute: 8, minute_extra: 0, team_id: "h", player_id: "p", related_player_id: null,
      shirt_number: 4, recorded_at: new Date(T0 - 70_000).toISOString(), voided_at: null, void_reason: null, active_at: 470 }],
  } as unknown as CanonicalState;
  const s = fromCanonical(c);
  assert.equal(s.rules?.redCardSuspensionSeconds, 60);
  assert.equal(s.clock.noAddedTime, true);
  assert.equal(activeSeconds(s.clock, T0 + 30 * SEC), 520);
  assert.equal(suspensionRemaining(s, playerStatuses(s, "home").get(4), T0 + 30 * SEC), 10, "470 + 60 − 520");
});

test("public pitch: a temporary red leaves a gap until the approved return", () => {
  const lineup = {
    players: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      shirtNumber: n, name: null, role: n <= 6 ? "STARTER" : "SUBSTITUTE", position: null, x: n <= 6 ? n * 10 : null, y: n <= 6 ? 50 : null,
      captain: false, goalkeeper: n === 1, booked: false, goals: 0, sentOff: false,
    })),
  } as Parameters<typeof currentPitch>[0];
  const e = (type: string, shirt: number, playerIn?: number) => ({ type, teamId: "h", minute: 3, player: { shirtNumber: shirt }, ...(playerIn ? { playerIn: { shirtNumber: playerIn } } : {}) });
  const shirts = (events: ReturnType<typeof e>[], temp = true) => currentPitch(lineup, "h", events, temp).map((p) => p.shirt).sort((a, b) => a - b);
  assert.deepEqual(shirts([e("RED_CARD", 4)]), [1, 2, 3, 5, 6]);
  assert.deepEqual(shirts([e("RED_CARD", 4), e("SUSPENSION_RETURN", 4)]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shirts([e("SUBSTITUTION", 2, 7), e("SUBSTITUTION", 7, 2)]), [1, 2, 3, 4, 5, 6], "re-entry");
  assert.deepEqual(shirts([e("RED_CARD", 4)], false), [1, 2, 3, 4, 5, 6], "normal football: unchanged behaviour (sent-off flag decides)");
});
