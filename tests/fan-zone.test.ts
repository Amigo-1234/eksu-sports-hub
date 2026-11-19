import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAction, parseGamesAction, parseTarget } from "../src/lib/fan/types.ts";
import { nextFixtures, splitTable } from "../src/lib/standings-views.ts";
import type { StandingRow } from "../src/lib/types.ts";

const UUID = "0b9f6f1e-7d2a-4c4e-9a51-3f0f1d2c3b4a";

test("fan targets: match uuids and news slugs only", () => {
  assert.deepEqual(parseTarget("match", UUID.toUpperCase()), { kind: "match", id: UUID });
  assert.deepEqual(parseTarget("news", "darul-saadah-win"), { kind: "news", id: "darul-saadah-win" });
  assert.equal(parseTarget("match", "not-a-uuid"), null);
  assert.equal(parseTarget("news", "Bad Slug"), null);
  assert.equal(parseTarget("news", "../admin"), null);
  assert.equal(parseTarget("team", UUID), null);
});

test("fan actions are rebuilt field by field", () => {
  assert.deepEqual(parseAction({ action: "like", extra: "x" }), { action: "like", payload: {} });
  assert.deepEqual(parseAction({ action: "vote", pick: "AWAY" }), { action: "vote", payload: { pick: "AWAY" } });
  assert.equal(parseAction({ action: "vote", pick: "MAYBE" }), null);
  assert.deepEqual(parseAction({ action: "comment", body: "  up EKSU  ", parent_id: "nope" }), {
    action: "comment",
    payload: { body: "up EKSU", parent_id: "" },
  });
  assert.equal(parseAction({ action: "comment", body: "   " }), null);
  assert.equal(parseAction({ action: "comment", body: "x".repeat(900) })?.payload.body.length, 500);
  assert.deepEqual(parseAction({ action: "report", comment_id: UUID }), { action: "report", payload: { comment_id: UUID } });
  assert.equal(parseAction({ action: "delete", comment_id: "1" }), null);
  assert.equal(parseAction({ action: "drop_table" }), null);
  assert.equal(parseAction(null), null);
});

const team = (id: string) => ({ id, name: id, shortName: id, code: id, colors: { primary: "#000", secondary: "#fff" } }) as unknown as StandingRow["team"];
const row = (id: string, position: number): StandingRow => ({
  competitionId: "c", teamId: id, position, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, form: [], team: team(id),
});
const m = (id: string, home: string, away: string, h: number, a: number, status = "FULL_TIME", kickoffAt = `2026-11-${id}T10:00:00Z`) =>
  ({ id, homeTeamId: home, awayTeamId: away, status, score: status === "SCHEDULED" ? null : { home: h, away: a }, kickoffAt, homeTeam: team(home), awayTeam: team(away) }) as never;

test("home and away tables count only that side's matches", () => {
  const overall = [row("A", 1), row("B", 2), row("C", 3)];
  const results = [m("10", "A", "B", 1, 0), m("11", "B", "C", 2, 2), m("12", "C", "A", 3, 1), m("13", "A", "C", 0, 0, "ABANDONED")];
  const home = splitTable(overall, results, "home");
  assert.deepEqual(home.map((r) => [r.teamId, r.played, r.points]), [["C", 1, 3], ["A", 1, 3], ["B", 1, 1]]);
  assert.equal(home[0].goalsFor, 3);
  const away = splitTable(overall, results, "away");
  assert.deepEqual(away.map((r) => [r.teamId, r.points, r.position]), [["C", 1, 1], ["B", 0, 2], ["A", 0, 3]]);
  assert.deepEqual(away[2].form.map((f) => f.outcome), ["L"]);
});

test("next fixture per team is the earliest scheduled one", () => {
  const n = nextFixtures([m("21", "A", "B", 0, 0, "SCHEDULED"), m("20", "C", "A", 0, 0, "SCHEDULED"), m("19", "B", "C", 0, 0, "POSTPONED")]);
  assert.equal(n.A.matchId, "20");
  assert.equal(n.A.home, false);
  assert.equal(n.B.matchId, "21");
  assert.equal(n.C.opponent, "A");
});

test("prediction and Player of the Match requests are validated", () => {
  assert.deepEqual(parseGamesAction({ action: "predict", home: 2, away: 1, x: 1 }), { action: "predict", payload: { home: 2, away: 1 } });
  assert.equal(parseGamesAction({ action: "predict", home: -1, away: 1 }), null);
  assert.equal(parseGamesAction({ action: "predict", home: 31, away: 1 }), null);
  assert.equal(parseGamesAction({ action: "predict", home: 1.5, away: 1 }), null);
  assert.equal(parseGamesAction({ action: "predict", home: "2", away: 1 }), null);
  assert.deepEqual(parseGamesAction({ action: "unpredict" }), { action: "unpredict", payload: {} });
  assert.deepEqual(parseGamesAction({ action: "potm", player_id: UUID }), { action: "potm", payload: { player_id: UUID } });
  assert.equal(parseGamesAction({ action: "potm", player_id: "x" }), null);
  assert.equal(parseGamesAction({ action: "vote" }), null);
});

test("emoji reactions accept only the known set", () => {
  assert.deepEqual(parseAction({ action: "burst", emoji: "fire" }), { action: "burst", payload: { emoji: "fire" } });
  assert.equal(parseAction({ action: "burst", emoji: "poop" }), null);
  assert.equal(parseAction({ action: "burst" }), null);
});
