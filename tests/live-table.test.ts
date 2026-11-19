import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLiveMatches } from "../src/lib/live-standings.ts";
import type { StandingRow } from "../src/lib/types.ts";

const team = (id: string) => ({ id, name: id, shortName: id, code: id, kind: "faculty", category: "men", colors: { primary: "#000", secondary: "#fff" } }) as unknown as StandingRow["team"];
const row = (id: string, position: number, extra: Partial<StandingRow> = {}): StandingRow => ({
  competitionId: "c", teamId: id, position, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, form: [], team: team(id), ...extra,
});
const match = (home: string, away: string, h: number, a: number, status = "LIVE_FIRST_HALF") =>
  ({ id: `${home}-${away}`, competitionId: "c", homeTeamId: home, awayTeamId: away, status, score: { home: h, away: a } }) as never;

test("the team winning a live match goes top, the loser drops, with movement", () => {
  const rows = [row("A", 1), row("B", 2), row("C", 3), row("D", 4)];
  const out = applyLiveMatches(rows, [match("D", "A", 2, 1)]);
  assert.deepEqual(out.map((r) => r.teamId), ["D", "B", "C", "A"]);
  const d = out[0];
  assert.equal(d.points, 3);
  assert.equal(d.played, 1);
  assert.equal(d.goalDifference, 1);
  assert.equal(d.movement, 3);
  assert.deepEqual(d.live, { matchId: "D-A", outcome: "W", goalsFor: 2, goalsAgainst: 1 });
  assert.equal(out[3].live?.outcome, "L");
  assert.equal(out[3].movement, -3);
  assert.equal(out[1].live, undefined);
  assert.deepEqual(out.map((r) => r.position), [1, 2, 3, 4]);
});

test("a live draw adds one point each; half-time counts as in play", () => {
  const out = applyLiveMatches([row("A", 1), row("B", 2), row("C", 3)], [match("B", "C", 1, 1, "HALF_TIME")]);
  assert.deepEqual(out.map((r) => [r.teamId, r.points]), [["B", 1], ["C", 1], ["A", 0]]);
});

test("completed points still count, and finished or scheduled matches are ignored", () => {
  const rows = [row("A", 1, { played: 1, won: 1, points: 3, goalsFor: 3, goalDifference: 3 }), row("B", 2), row("C", 3)];
  const out = applyLiveMatches(rows, [match("B", "C", 1, 0), match("A", "B", 0, 5, "FULL_TIME"), match("C", "A", 9, 0, "SCHEDULED")]);
  assert.deepEqual(out.map((r) => r.teamId), ["A", "B", "C"]);
  assert.equal(out[0].live, undefined);
});

test("no live matches or group tables: rows unchanged", () => {
  const rows = [row("A", 1), row("B", 2)];
  assert.equal(applyLiveMatches(rows, []), rows);
  const groups = [row("A", 1), row("B", 2), row("C", 1), row("D", 2)];
  assert.equal(applyLiveMatches(groups, [match("B", "A", 3, 0)]), groups);
});
