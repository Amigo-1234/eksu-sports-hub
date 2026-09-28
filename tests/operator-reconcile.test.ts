/**
 * Canonical-state mapping and optimistic reconciliation. Run: npm run test:operator
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCanonical, type CanonicalState } from "../src/lib/operator/canonical.ts";
import { applyCommand, computeScore } from "../src/lib/operator/engine.ts";
import { displayClock } from "../src/lib/operator/clock.ts";
import { operatorStore } from "../src/lib/operator/store.ts";
import type { Intent } from "../src/lib/operator/queue.ts";

const HOME = "team-home", AWAY = "team-away";
const T0 = Date.parse("2026-09-28T15:00:00Z");

function canonical(seq: number, events: CanonicalState["events"] = [], extra: Partial<CanonicalState["match"]> = {}): CanonicalState {
  return {
    match: {
      id: "m1", status: "2H", home_team_id: HOME, away_team_id: AWAY, home_score: 0, away_score: 0, seq,
      current_period: 2, period_started_at: new Date(T0).toISOString(), period_ended_at: null,
      period_offset_seconds: 2700, clock_running: true, paused_at: null, accumulated_pause_seconds: "30.000",
      stoppage_seconds: 120, ...extra,
    },
    events,
  };
}

test("canonical → operator state maps phase, clock and events", () => {
  const s = fromCanonical(canonical(7, [
    { id: "e1", seq: 3, type: "OWN_GOAL", period: 2, minute: 50, minute_extra: 0, team_id: AWAY, player_id: "p", related_player_id: null,
      shirt_number: 4, recorded_at: new Date(T0).toISOString(), voided_at: null, void_reason: null },
  ]));
  assert.equal(s.phase, "SECOND_HALF");
  assert.equal(s.version, 7);
  assert.equal(s.clock.periodOffsetSeconds, 2700);
  assert.equal(s.clock.accumulatedPauseSeconds, 30);
  // 10 min after period start minus 30 s pause → 45:00 + 9:30 = 54:30 → 55'
  assert.equal(displayClock(s.clock, T0 + 10 * 60_000).label, "55'");
  assert.equal(displayClock(s.clock, T0).announcedMinutes, 2);
  assert.equal(s.events[0].side, "away");
  assert.equal(s.events[0].shirt, 4);
  assert.deepEqual(computeScore(s), { home: 1, away: 0 }, "own goal by away player credits home");
});

test("replaying an event already in state is a no-op (idempotent)", () => {
  const base = fromCanonical(canonical(1));
  const input = { command: "RECORD_EVENT" as const, event: { id: "g1", type: "GOAL" as const, side: "home" as const, shirt: 9, minute: 60, addedTime: 0 } };
  const once = applyCommand(base, input, { now: T0, newId: () => "x", intentId: "g1" });
  assert.ok(once.ok);
  const twice = applyCommand(once.state, input, { now: T0 + 999_999, newId: () => "y", intentId: "g1" });
  assert.ok(twice.ok);
  assert.equal(twice.state.events.length, 1);
  assert.equal(twice.state.events[0].minute, 60, "captured minute kept on replay");
});

test("reconcile: server state wins, pending intents are replayed, stale responses ignored", () => {
  operatorStore.reset();
  const pending: Intent = {
    id: "g2", matchId: "m1", action: "record_event", clientTimestamp: T0,
    args: { command: "RECORD_EVENT", event: { id: "g2", type: "GOAL", side: "away", shirt: null, minute: 61, addedTime: 0 } },
    state: "PENDING", attempts: 0, lastError: null,
  };
  operatorStore.intents.put(pending);
  operatorStore.reconcile("m1", fromCanonical(canonical(5)));
  let shown = operatorStore.get().matches.m1;
  assert.deepEqual(computeScore(shown), { home: 0, away: 1 }, "pending goal shown optimistically on top of server state");

  // Server confirms: canonical now contains the goal; intent confirmed.
  operatorStore.intents.update("g2", { state: "CONFIRMED" });
  const confirmed = canonical(6, [{ id: "g2", seq: 6, type: "GOAL", period: 2, minute: 61, minute_extra: 0, team_id: AWAY,
    player_id: null, related_player_id: null, recorded_at: new Date(T0).toISOString(), voided_at: null, void_reason: null }], { away_score: 1 });
  operatorStore.reconcile("m1", fromCanonical(confirmed), true);
  shown = operatorStore.get().matches.m1;
  assert.equal(shown.events.length, 1, "no duplicate after confirmation");
  assert.equal(shown.events[0].seq, 6);
  assert.equal(operatorStore.get().inControl.m1, true);

  // An older response arriving late does not roll state back.
  operatorStore.reconcile("m1", fromCanonical(canonical(4)));
  assert.equal(operatorStore.get().canonical.m1.version, 6);
  assert.equal(operatorStore.get().matches.m1.events.length, 1);
});
