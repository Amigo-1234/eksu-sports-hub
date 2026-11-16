/**
 * Demo-data only (never live data): `?simulate` on a match page plays a short
 * scripted sequence of updates so the live alerts and sounds can be tried and
 * tested without a real match. The provider only calls this when realtime is
 * disabled, i.e. on the mock data source.
 */
import type { MatchDetail, MatchEvent } from "@/lib/types";

type Step = (m: MatchDetail) => MatchDetail;

const add = (m: MatchDetail, e: Omit<MatchEvent, "matchId">, score?: { home: number; away: number }): MatchDetail => ({
  ...m,
  seq: (m.seq ?? 0) + 1,
  score: score ?? m.score,
  events: [...m.events, { ...e, matchId: m.id }],
});

export function simulationSteps(): Step[] {
  const s = (m: MatchDetail) => m.score ?? { home: 0, away: 0 };
  const minute = (m: MatchDetail) => Math.max(1, ...m.events.map((e) => e.minute)) + 2;
  return [
    (m) => add(m, { id: "sim-goal", type: "GOAL", teamId: m.homeTeamId, minute: minute(m), player: { shirtNumber: 9 } }, { ...s(m), home: s(m).home + 1 }),
    (m) => add(m, { id: "sim-pen", type: "PENALTY_AWARDED", teamId: m.awayTeamId, minute: minute(m), player: { shirtNumber: null } }),
    (m) => add(m, { id: "sim-red", type: "RED_CARD", teamId: m.homeTeamId, minute: minute(m), player: { shirtNumber: 4 } }),
    (m) => add(m, { id: "sim-sub", type: "SUBSTITUTION", teamId: m.awayTeamId, minute: minute(m), player: { shirtNumber: 11 }, playerIn: { shirtNumber: 18 } }),
    (m) => ({ ...m, seq: (m.seq ?? 0) + 1, score: { ...s(m), home: Math.max(0, s(m).home - 1) }, events: m.events.filter((e) => e.id !== "sim-goal") }),
    (m) => ({ ...m, seq: (m.seq ?? 0) + 1, status: "FULL_TIME" }),
  ];
}
