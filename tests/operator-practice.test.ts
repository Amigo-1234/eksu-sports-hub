import assert from "node:assert/strict";
import { test } from "node:test";
import { CUES, markPractice, visibleCues } from "../src/lib/practice/script.ts";
import type { OpEvent, OpLogEntry, OpMatchState } from "../src/lib/operator/types.ts";

const T0 = 1_000_000;
let n = 0;
const ev = (type: OpEvent["type"], side: "home" | "away", shirt: number, minute: number, extra: Partial<OpEvent> = {}): OpEvent => ({
  id: `e${++n}`, matchId: "p", type, side, minute, addedTime: 0, shirt, recordedAt: T0 + minute * 60_000, voided: null, intentId: null, ...extra,
});
const log = (kind: OpLogEntry["kind"], at: number, detail?: string): OpLogEntry => ({ id: `l${kind}${at}`, at, kind, detail });
const state = (events: OpEvent[], phase: OpMatchState["phase"] = "FULL_TIME", extraLog: OpLogEntry[] = []): OpMatchState => ({
  matchId: "p",
  phase,
  clock: { period: 2, periodOffsetSeconds: 300, periodStartedAt: T0 + 400_000, periodEndedAt: null, clockRunning: false, pausedAt: null, accumulatedPauseSeconds: 0, stoppageSeconds: 0, halfSeconds: 300, etHalfSeconds: 0 },
  events,
  log: [log("MATCH_STARTED", T0), log("PERIOD_ENDED", T0 + 300_000), log("PERIOD_STARTED", T0 + 400_000, "2H"), ...(phase === "FULL_TIME" ? [log("MATCH_FINALISED", T0 + 700_000, "2-1")] : []), ...extraLog],
  version: 1,
});

const perfect = () => [
  ev("GOAL", "home", 9, 1, { voided: { at: T0 + 130_000, reason: "Wrong scorer" } }),
  ev("YELLOW_CARD", "away", 4, 2),
  ev("GOAL", "home", 10, 3),
  ev("SUBSTITUTION", "home", 7, 4, { shirtIn: 14 }),
  ev("GOAL", "away", 11, 6),
  ev("PENALTY_GOAL", "home", 10, 7),
  ev("SECOND_YELLOW", "away", 4, 8),
];

test("a perfect attempt scores 100", () => {
  const m = markPractice(state(perfect()));
  assert.equal(m.score, 100, JSON.stringify(m.items.filter((i) => i.points < i.max)));
  assert.deepEqual(m.finalScore, { home: 2, away: 1 });
  assert.equal(m.strayEvents, 0);
});

test("forgetting the correction costs the correction points", () => {
  const e = perfect().filter((x) => !(x.type === "GOAL" && x.shirt === 10));
  e[0] = { ...e[0], voided: null };
  const m = markPractice(state(e));
  const corr = m.items.find((i) => i.id === "goal-correction")!;
  assert.equal(corr.points, 3);
  assert.equal(m.score, 93); // wrong scorer left in: score happens to still be 2–1
});

test("wrong player gets half; late recording loses a quarter; strays cost 5 each", () => {
  const e = perfect();
  e[1] = { ...e[1], shirt: 5 }; // wrong booked player
  e[3] = { ...e[3], minute: 9 }; // sub recorded far too late
  e.push(ev("YELLOW_CARD", "home", 2, 5), ev("INJURY", "away", 3, 6));
  const m = markPractice(state(e));
  assert.equal(m.items.find((i) => i.id === "yellow4")!.points, 5);
  assert.equal(m.items.find((i) => i.id === "sub")!.points, 8);
  assert.equal(m.items.find((i) => i.id === "clean")!.points, 0);
});

test("penalty recorded as plain goal and red instead of second yellow get partial credit", () => {
  const e = perfect().map((x) => (x.type === "PENALTY_GOAL" ? { ...x, type: "GOAL" as const } : x.type === "SECOND_YELLOW" ? { ...x, type: "RED_CARD" as const } : x));
  const m = markPractice(state(e));
  assert.equal(m.items.find((i) => i.id === "penalty")!.points, 5);
  assert.equal(m.items.find((i) => i.id === "second-yellow")!.points, 5);
});

test("an unfinished match gets no full-time points", () => {
  const m = markPractice(state(perfect(), "SECOND_HALF"));
  assert.equal(m.items.find((i) => i.id === "fulltime")!.points, 0);
});

test("cues appear with the match clock", () => {
  const s = state([], "FIRST_HALF");
  assert.deepEqual(visibleCues(s, 0).map((c) => c.id), ["kickoff"]);
  assert.deepEqual(visibleCues(s, 95).map((c) => c.id), ["kickoff", "goal9", "yellow4"]);
  assert.equal(visibleCues(state([], "HALF_TIME"), 300).at(-1)!.id, "second");
  assert.equal(visibleCues(state([], "FULL_TIME"), 600).length, CUES.length);
});
