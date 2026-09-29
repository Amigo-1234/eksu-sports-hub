import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFeed, derivedScore, shouldFetch } from "../src/lib/realtime/matchSync.ts";
import type { MatchDetail } from "../src/lib/types.ts";

const HOME = "home-team";
const AWAY = "away-team";

function base(over: Partial<MatchDetail> = {}): MatchDetail {
  return {
    id: "m1", competitionId: "c1", homeTeamId: HOME, awayTeamId: AWAY, venueId: "v1",
    kickoffAt: "2026-10-04T15:00:00Z", status: "LIVE_FIRST_HALF", score: { home: 0, away: 0 },
    round: "MD1", periodStartedAt: "2026-10-04T15:00:00Z", seq: 1, clock: null, events: [],
    homeTeam: {} as never, awayTeam: {} as never, competition: {} as never, venue: {} as never,
    ...over,
  };
}
const row = (seq: number, home: number, away: number, status = "1H") => ({
  id: "m1", status, seq, home_score: home, away_score: away, current_period: 1,
  period_started_at: "2026-10-04T15:00:00Z", period_offset_seconds: 0, clock_running: true,
  paused_at: null, accumulated_pause_seconds: 0, stoppage_seconds: 0,
});
const ev = (id: string, seq: number, type: string, team: string, minute: number, voided = false) => ({
  id, seq, type, team_id: team, minute, minute_extra: 0, period: minute > 45 ? 2 : 1, shirt_number: 9, voided,
});

test("duplicate and old hints are ignored; newer hints fetch", () => {
  const m = base({ seq: 5 });
  assert.equal(shouldFetch(m, 5), false);
  assert.equal(shouldFetch(m, 3), false);
  assert.equal(shouldFetch(m, 6), true);
  assert.equal(shouldFetch(m, 9), true); // gap: one fetch after seq 5 recovers 6..9
});

test("goal applies score and event; applying the same feed twice is idempotent", () => {
  const feed = { match: row(2, 1, 0), events: [ev("g1", 2, "GOAL", HOME, 10)], voided_ids: [] };
  const a = applyFeed(base(), feed);
  assert.equal(a.kind, "applied");
  const m1 = (a as { match: MatchDetail }).match;
  assert.deepEqual(m1.score, { home: 1, away: 0 });
  assert.equal(m1.events.length, 1);
  const b = applyFeed(m1, feed);
  assert.equal((b as { match: MatchDetail }).match.events.length, 1, "duplicate event not added twice");
});

test("seq gap: missed events arrive in one delta and are ordered by minute", () => {
  const start = (applyFeed(base(), { match: row(2, 1, 0), events: [ev("g1", 2, "GOAL", HOME, 10)], voided_ids: [] }) as { match: MatchDetail }).match;
  const feed = {
    match: row(5, 1, 1),
    events: [ev("yc", 3, "YELLOW_CARD", AWAY, 20), ev("g2", 4, "GOAL", AWAY, 25), ev("late", 5, "SUBSTITUTION", HOME, 15)],
    voided_ids: [],
  };
  const r = applyFeed(start, feed) as { kind: string; match: MatchDetail };
  assert.equal(r.kind, "applied");
  assert.deepEqual(r.match.events.map((e) => e.id), ["g1", "late", "yc", "g2"]);
  assert.equal(r.match.seq, 5);
});

test("voided goal is removed and the score reconciles", () => {
  const start = (applyFeed(base(), { match: row(2, 1, 0), events: [ev("g1", 2, "GOAL", HOME, 10)], voided_ids: [] }) as { match: MatchDetail }).match;
  const r = applyFeed(start, { match: row(3, 0, 0), events: [], voided_ids: ["g1"] }) as { kind: string; match: MatchDetail };
  assert.equal(r.kind, "applied");
  assert.equal(r.match.events.length, 0);
  assert.deepEqual(r.match.score, { home: 0, away: 0 });
});

test("stale responses never move the page backwards", () => {
  assert.equal(applyFeed(base({ seq: 7 }), { match: row(6, 0, 0), events: [], voided_ids: [] }).kind, "stale");
});

test("canonical score disagreeing with known events asks for a full resync", () => {
  // We never saw the goal (e.g. its hint and delta were lost) but the score says 1–0.
  const r = applyFeed(base({ seq: 2 }), { match: row(3, 1, 0), events: [], voided_ids: [] });
  assert.equal(r.kind, "inconsistent");
});

test("own goals credit the opponent; HT/2H/FT statuses map through", () => {
  const m = base({ events: [{ id: "og", matchId: "m1", type: "OWN_GOAL", teamId: AWAY, minute: 5, player: { shirtNumber: 3 } }] });
  assert.deepEqual(derivedScore(m), { home: 1, away: 0 });
  for (const [db, ui] of [["HT", "HALF_TIME"], ["2H", "LIVE_SECOND_HALF"], ["FT", "FULL_TIME"]]) {
    const r = applyFeed(base(), { match: row(2, 0, 0, db), events: [], voided_ids: [] }) as { match: MatchDetail };
    assert.equal(r.match.status, ui);
  }
});
