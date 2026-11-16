/** Live match alerts and sound selection. Run: npm run test:live */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAlerts, soundFor } from "../src/lib/live/alerts.ts";
import type { MatchDetail, MatchEvent } from "../src/lib/types.ts";

const team = (id: string, name: string) => ({ id, name, shortName: name, code: name.slice(0, 3), kind: "faculty", category: "men", colors: { primary: "#000", secondary: "#fff" } });
const base = {
  id: "m1",
  homeTeamId: "h",
  awayTeamId: "a",
  homeTeam: team("h", "Downfall FC"),
  awayTeam: team("a", "School Gate"),
  status: "LIVE_SECOND_HALF",
  score: { home: 1, away: 1 },
  seq: 10,
  events: [] as MatchEvent[],
} as unknown as MatchDetail;
const ev = (id: string, type: MatchEvent["type"], teamId: string, minute: number, name?: string): MatchEvent =>
  ({ id, matchId: "m1", type, teamId, minute, player: { shirtNumber: 9, name } }) as MatchEvent;
const withEvents = (m: MatchDetail, extra: Partial<MatchDetail>, ...events: MatchEvent[]): MatchDetail => ({ ...m, ...extra, events: [...m.events, ...events] });

test("no change → no alerts (opening or refreshing a match never alerts)", () => {
  assert.deepEqual(detectAlerts(base, { ...base }), []);
});

test("a new goal alerts with score line, scorer and minute, and picks the goal sound", () => {
  const next = withEvents(base, { score: { home: 2, away: 1 }, seq: 11 }, ev("g1", "GOAL", "h", 67, "Al Ameen"));
  const [a] = detectAlerts(base, next);
  assert.equal(a.title, "GOAL!");
  assert.equal(a.scoreLine, "Downfall FC 2–1 School Gate");
  assert.equal(a.detail, "Al Ameen — 67'");
  assert.equal(a.sound, "goal");
});

test("penalty awarded alerts with the penalty sound and leaves the score alone", () => {
  const next = withEvents(base, { seq: 11 }, ev("p1", "PENALTY_AWARDED", "a", 32));
  const alerts = detectAlerts(base, next);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, "Penalty to School Gate");
  assert.equal(alerts[0].sound, "penalty");
  assert.equal(alerts[0].scoreLine, "Downfall FC 1–1 School Gate");
});

test("cards, substitutions, injuries", () => {
  const next = withEvents(
    base,
    { seq: 14 },
    ev("r1", "RED_CARD", "a", 52, "Mark"),
    ev("y1", "YELLOW_CARD", "h", 53, "Samuel"),
    { ...ev("s1", "SUBSTITUTION", "h", 60, "Richard"), playerIn: { shirtNumber: 7, name: "Zico" } },
    ev("i1", "INJURY", "h", 67),
  );
  const alerts = detectAlerts(base, next);
  assert.deepEqual(alerts.map((a) => a.sound), ["red", null, "sub", null]);
  assert.equal(alerts[2].detail, "Richard off, Zico on — 60'");
  assert.equal(alerts[3].title, "Injury — play stopped");
  // Only one sound per update: the most important.
  assert.equal(soundFor(alerts, () => true), "red");
  assert.equal(soundFor(alerts, (k) => k !== "red"), "sub");
});

test("an undone goal corrects the score quietly and never re-alerts the goal", () => {
  const scored = withEvents(base, { score: { home: 2, away: 1 }, seq: 11 }, ev("g1", "GOAL", "h", 67));
  const undone = { ...scored, score: { home: 1, away: 1 }, seq: 12, events: base.events };
  const alerts = detectAlerts(scored, undone);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, "Score corrected");
  assert.equal(alerts[0].sound, null);
});

test("a full resync that rebuilds the same events alerts nothing", () => {
  const a = withEvents(base, { seq: 11 }, ev("g1", "GOAL", "h", 67));
  const rebuilt = { ...a, events: a.events.map((e) => ({ ...e })) };
  assert.deepEqual(detectAlerts(a, rebuilt), []);
});

test("half-time and full-time transitions", () => {
  const first = { ...base, status: "LIVE_FIRST_HALF" } as MatchDetail;
  const ht = detectAlerts(first, { ...first, status: "HALF_TIME" } as MatchDetail);
  assert.equal(ht[0].sound, "ht");
  const ft = detectAlerts(base, { ...base, status: "FULL_TIME" } as MatchDetail);
  assert.equal(ft[0].title, "Full-time");
  assert.equal(ft[0].sound, "ft");
  // A goal and the final whistle in one update: the goal sound wins, full-time is listed last.
  const both = detectAlerts(base, withEvents(base, { status: "FULL_TIME", score: { home: 2, away: 1 } } as Partial<MatchDetail>, ev("g9", "GOAL", "h", 90)));
  assert.deepEqual(both.map((a) => a.title), ["GOAL!", "Full-time"]);
  assert.equal(soundFor(both, () => true), "goal");
});
