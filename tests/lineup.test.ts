import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assign,
  changeFormation,
  counts,
  currentPitch,
  draftFromState,
  draftProblems,
  startingPitch,
  toPayload,
  type LineupDraft,
  type LineupEditorState,
} from "../src/lib/lineup.ts";
import { consoleSquads, isAvailableSub, isOnField, type ConsolePlayer } from "../src/lib/operator/lineup.ts";
import { applyFeed } from "../src/lib/realtime/matchSync.ts";
import type { AssignmentSeed } from "../src/lib/operator/types.ts";
import type { MatchDetail, PublicLineupPlayer } from "../src/lib/types.ts";

const F442 = {
  code: "4-4-2",
  name: "4-4-2",
  slots: [
    { position: "GK", x: 50, y: 92 },
    ...Array.from({ length: 10 }, (_, i) => ({ position: i < 4 ? "DF" : i < 8 ? "MF" : "ST", x: 10 + i * 8, y: 70 - i * 5 })),
  ],
};
const F433 = { ...F442, code: "4-3-3", name: "4-3-3" };

function state(eligibility: Record<string, string> = {}): LineupEditorState {
  return {
    viewer_role: "ADMIN",
    match: { id: "m", status: "SCHEDULED", scheduled_at: "", side: "home", competition: "", season_id: "", lineup_override: null },
    team: { id: "t", name: "Team", short_name: "T", code: "T", color_primary: "#000000", color_secondary: "#ffffff" },
    editable: true,
    rules: { min_starters: 7, max_starters: 11, max_substitutes: 12 },
    formations: [F442, F433],
    lineup: null,
    squad: Array.from({ length: 18 }, (_, i) => ({
      player_id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      shirt_number: i + 1,
      position: null,
      captain: false,
      eligibility: (eligibility[`p${i + 1}`] ?? "CLEARED") as never,
    })),
  };
}

const full = (): LineupDraft => {
  let d: LineupDraft = { formation: "4-4-2", picks: {}, captain: null };
  for (let i = 0; i < 11; i++) d = assign(d, `p${i + 1}`, { role: "STARTER", slot: i });
  for (let i = 11; i < 16; i++) d = assign(d, `p${i + 1}`, { role: "SUBSTITUTE", slot: null });
  return { ...d, captain: "p10" };
};

test("a complete, eligible line-up has no problems and a stable payload", () => {
  const d = full();
  assert.deepEqual(draftProblems(d, state()), []);
  assert.deepEqual(counts(d), { starters: 11, substitutes: 5, unplaced: 0 });
  const payload = toPayload(d);
  assert.equal(payload.length, 16);
  assert.equal(payload[0].slot, 0);
  assert.equal(payload.filter((p) => p.captain).length, 1);
  assert.equal(payload.find((p) => p.captain)?.player_id, "p10");
});

test("incomplete XI, missing goalkeeper and ineligible players are flagged", () => {
  let d: LineupDraft = { formation: "4-4-2", picks: {}, captain: null };
  d = assign(d, "p2", { role: "STARTER", slot: 1 });
  const problems = draftProblems(d, state({ p2: "SUSPENDED" }));
  assert.ok(problems.some((p) => p.startsWith("Starting XI incomplete")));
  assert.ok(problems.some((p) => p.includes("goalkeeper")));
  assert.ok(problems.some((p) => p.includes("suspended")));
});

test("placing a player in an occupied slot moves the previous player out, never drops them", () => {
  let d = full();
  d = assign(d, "p12", { role: "STARTER", slot: 3 });
  assert.deepEqual(d.picks.p12, { role: "STARTER", slot: 3 });
  assert.deepEqual(d.picks.p4, { role: "STARTER", slot: null });
  assert.equal(counts(d).unplaced, 1);
});

test("a player is either starter or substitute, and the captain must start", () => {
  let d = full();
  d = assign(d, "p10", { role: "SUBSTITUTE", slot: null });
  assert.equal(d.picks.p10.role, "SUBSTITUTE");
  assert.equal(d.captain, null, "armband removed when the captain is benched");
  assert.equal(Object.keys(d.picks).filter((k) => k === "p10").length, 1);
});

test("changing formation keeps starters in existing slots", () => {
  const d = changeFormation(full(), "4-3-3", 11);
  assert.equal(d.formation, "4-3-3");
  assert.equal(counts(d).unplaced, 0);
});

test("draftFromState restores picks and captain from a saved line-up", () => {
  const s = state();
  s.lineup = {
    id: "l", status: "DRAFT", formation: "4-3-3", confirmed_at: null, confirmed_by: null, updated_at: "", problems: [], confirm_problems: [],
    players: [
      { player_id: "p1", name: null, shirt_number: 1, role: "STARTER", position: "GK", slot: 0, x: 50, y: 92, captain: false, goalkeeper: true, eligibility: "CLEARED" },
      { player_id: "p9", name: null, shirt_number: 9, role: "STARTER", position: "ST", slot: 9, x: 50, y: 20, captain: true, goalkeeper: false, eligibility: "CLEARED" },
      { player_id: "p14", name: null, shirt_number: 14, role: "SUBSTITUTE", position: null, slot: null, x: null, y: null, captain: false, goalkeeper: false, eligibility: "CLEARED" },
    ],
  };
  const d = draftFromState(s);
  assert.equal(d.formation, "4-3-3");
  assert.equal(d.captain, "p9");
  assert.deepEqual(d.picks.p14, { role: "SUBSTITUTE", slot: null });
});

// ── Public pitch: current on-field view ───────────────────────────────────────
function lp(shirt: number, role: "STARTER" | "SUBSTITUTE", over: Partial<PublicLineupPlayer> = {}): PublicLineupPlayer {
  return {
    shirtNumber: shirt, name: `P${shirt}`, role, position: role === "STARTER" ? "CM" : null,
    x: role === "STARTER" ? shirt * 8 : null, y: role === "STARTER" ? 50 : null, captain: false, goalkeeper: shirt === 1,
    onField: role === "STARTER", subbedOn: false, subbedOff: false, onMinute: null, onExtra: null, offMinute: null, offExtra: null,
    sentOff: false, booked: false, goals: 0, ...over,
  };
}
const lineup = { teamId: "H", formation: "4-4-2", players: [...Array.from({ length: 11 }, (_, i) => lp(i + 1, "STARTER")), lp(12, "SUBSTITUTE"), lp(14, "SUBSTITUTE")] };
const sub = (off: number, on: number, minute: number) => ({ type: "SUBSTITUTION", teamId: "H", minute, player: { shirtNumber: off }, playerIn: { shirtNumber: on } });

test("a substitute takes the position of the player replaced", () => {
  const pitch = currentPitch(lineup, "H", [sub(7, 14, 60)]);
  assert.equal(pitch.length, 11);
  assert.ok(!pitch.some((p) => p.shirt === 7));
  const on = pitch.find((p) => p.shirt === 14)!;
  assert.equal(on.x, 7 * 8, "same spot as No. 7");
  assert.deepEqual(on.cameOn, { minute: 60, extra: 0 });
});

test("a sent-off player leaves the pitch; other teams' subs are ignored", () => {
  const l = { ...lineup, players: lineup.players.map((p) => (p.shirtNumber === 5 ? { ...p, sentOff: true } : p)) };
  const pitch = currentPitch(l, "H", [{ ...sub(3, 12, 30), teamId: "A" }]);
  assert.equal(pitch.length, 10);
  assert.ok(!pitch.some((p) => p.shirt === 5));
  assert.ok(pitch.some((p) => p.shirt === 3), "away-team substitution does not touch home");
  assert.equal(startingPitch(l).length, 11, "starting XI view is unchanged");
});

// ── Operator console: who may be picked ───────────────────────────────────────
test("operator: OFF must be on the pitch, ON must be an unused substitute", () => {
  const starter: ConsolePlayer = { shirt: 7, name: null, role: "STARTER" };
  const bench: ConsolePlayer = { shirt: 14, name: null, role: "SUBSTITUTE" };
  const none = { yellow: false, sentOff: false, subbedOff: false, subbedOn: false };
  assert.equal(isOnField(starter, none), true);
  assert.equal(isOnField(bench, none), false);
  assert.equal(isOnField(bench, { ...none, subbedOn: true }), true);
  assert.equal(isOnField(starter, { ...none, sentOff: true }), false, "red card removes the player");
  assert.equal(isAvailableSub(bench, none), true);
  assert.equal(isAvailableSub(starter, none), false, "a starter cannot come on");
  assert.equal(isAvailableSub(bench, { ...none, sentOff: true }), false, "a dismissed substitute cannot come on");
  assert.equal(isAvailableSub(bench, { ...none, subbedOn: true }), false, "already on");
});

test("operator: confirmed line-up replaces the squad in the console; without one the squad is used", () => {
  const seed = {
    squads: { home: [{ playerId: "a", shirt: 3, name: "Sq" }], away: [{ playerId: "b", shirt: 4, name: null }] },
    lineups: {
      home: { status: "CONFIRMED", formation: "4-4-2", problems: [], players: [{ playerId: "a", shirt: 3, name: "Sq", role: "STARTER", position: "CB", captain: false, goalkeeper: false }] },
      away: { status: "DRAFT", formation: null, problems: [], players: [] },
    },
  } as unknown as AssignmentSeed;
  const c = consoleSquads(seed)!;
  assert.deepEqual(c.home, [{ shirt: 3, name: "Sq", role: "STARTER" }]);
  assert.deepEqual(c.away, [{ shirt: 4, name: null, role: null }], "draft line-ups are not used for recording");
});

// ── Realtime: line-ups arrive with the normal resync ─────────────────────────
test("feed line-ups replace the current ones (publish, substitution, reopen)", () => {
  const base = {
    id: "m1", competitionId: "c", homeTeamId: "H", awayTeamId: "A", venueId: "v", kickoffAt: "", status: "SCHEDULED", score: null,
    round: "", periodStartedAt: null, seq: 1, clock: null, events: [], lineups: [],
    homeTeam: {} as never, awayTeam: {} as never, competition: {} as never, venue: {} as never,
  } as MatchDetail;
  const row = { id: "m1", status: "SCHEDULED", seq: 2, home_score: 0, away_score: 0, current_period: null };
  const published = applyFeed(base, {
    match: row, events: [], voided_ids: [],
    lineups: [{ team_id: "H", formation: "4-4-2", players: [{ shirt_number: 9, name: "Nine", role: "STARTER", x: 50, y: 20, captain: true, on_field: true, goals: 0 }] }],
  });
  assert.equal(published.kind, "applied");
  const m = (published as { match: MatchDetail }).match;
  assert.equal(m.lineups?.length, 1);
  assert.equal(m.lineups?.[0].players[0].captain, true);
  assert.equal("player_id" in (m.lineups?.[0].players[0] ?? {}), false, "no internal ids in the UI model");
  const reopened = applyFeed(m, { match: { ...row, seq: 3 }, events: [], voided_ids: [], lineups: [] });
  assert.equal((reopened as { match: MatchDetail }).match.lineups?.length, 0, "a reopened (draft) line-up disappears");
});
