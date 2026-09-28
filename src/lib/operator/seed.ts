/**
 * Build the operator's starting state from the published match record.
 * In production this is what the `get_operator_match` RPC would return.
 */
import type { MatchDetail, MatchEventType } from "../types.ts";
import { HALF_SECONDS, initialClock, type ClockState } from "./clock.ts";
import { fromPublicStatus } from "./machine.ts";
import type { OpEvent, OpEventType, OpMatchState } from "./types.ts";

const EVENT_MAP: Partial<Record<MatchEventType, OpEventType>> = {
  GOAL: "GOAL",
  PENALTY_GOAL: "PENALTY_GOAL",
  OWN_GOAL: "OWN_GOAL",
  YELLOW_CARD: "YELLOW_CARD",
  RED_CARD: "RED_CARD",
  SUBSTITUTION: "SUBSTITUTION",
  // PENALTY_MISS is not recorded from the operator console yet.
};

function seedClock(m: MatchDetail): ClockState {
  const phase = fromPublicStatus(m.status);
  const kickoff = Date.parse(m.kickoffAt);
  const started = m.periodStartedAt ? Date.parse(m.periodStartedAt) : null;
  switch (phase) {
    case "FIRST_HALF":
      return { ...initialClock(), period: 1, periodStartedAt: started ?? kickoff, clockRunning: true };
    case "SECOND_HALF":
      return {
        ...initialClock(),
        period: 2,
        periodOffsetSeconds: HALF_SECONDS,
        periodStartedAt: started ?? kickoff + 60 * 60_000,
        clockRunning: true,
      };
    case "HALF_TIME":
      return {
        ...initialClock(),
        period: 1,
        periodStartedAt: kickoff,
        periodEndedAt: kickoff + HALF_SECONDS * 1000,
      };
    case "FULL_TIME":
    case "ABANDONED":
      return {
        ...initialClock(),
        period: 2,
        periodOffsetSeconds: HALF_SECONDS,
        periodStartedAt: kickoff + 60 * 60_000,
        periodEndedAt: kickoff + 105 * 60_000,
      };
    default:
      return initialClock();
  }
}

export function seedMatchState(m: MatchDetail): OpMatchState {
  const events: OpEvent[] = [];
  for (const e of m.events) {
    const type = EVENT_MAP[e.type];
    if (!type) continue;
    events.push({
      id: e.id,
      matchId: m.id,
      type,
      side: e.teamId === m.homeTeamId ? "home" : "away",
      minute: e.minute,
      addedTime: e.addedTime ?? 0,
      shirt: e.player.shirtNumber,
      ...(type === "SUBSTITUTION" ? { shirtIn: e.playerIn?.shirtNumber ?? null } : {}),
      recordedAt: 0,
      voided: null,
      intentId: null,
    });
  }
  return {
    matchId: m.id,
    phase: fromPublicStatus(m.status),
    clock: seedClock(m),
    events,
    log: [],
    version: 0,
  };
}
