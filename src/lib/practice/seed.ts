import { initialClock } from "../operator/clock.ts";
import type { AssignmentSeed, OpLineup, OpMatchState } from "../operator/types.ts";
import type { MatchDetail, Team } from "../types.ts";
import { PRACTICE_HALF_SECONDS } from "./script.ts";

/** Fixed id: practice state lives only in this browser's demo store. */
export const PRACTICE_MATCH_ID = "practice-match";

const team = (id: string, name: string, code: string, primary: string): Team => ({
  id,
  name,
  shortName: name,
  code,
  kind: "faculty",
  category: "men",
  colors: { primary, secondary: "#ffffff" },
});

export const PRACTICE_HOME = team("practice-blue", "Practice Blue", "BLU", "#1d4ed8");
export const PRACTICE_AWAY = team("practice-red", "Practice Red", "RED", "#be123c");

/** Shirts 1–11 start, 12–18 on the bench. Shirt numbers only: no real players. */
function lineup(): OpLineup {
  return {
    status: "CONFIRMED",
    formation: null,
    problems: [],
    demo: true,
    players: Array.from({ length: 18 }, (_, i) => ({
      playerId: `p${i + 1}`,
      shirt: i + 1,
      name: null,
      role: i < 11 ? ("STARTER" as const) : ("SUBSTITUTE" as const),
      position: null,
      captain: i === 9,
      goalkeeper: i === 0,
    })),
  };
}

export function practiceSeed(kickoffAt: string): AssignmentSeed {
  const match: MatchDetail = {
    id: PRACTICE_MATCH_ID,
    competitionId: "practice",
    homeTeamId: PRACTICE_HOME.id,
    awayTeamId: PRACTICE_AWAY.id,
    venueId: "practice",
    kickoffAt,
    status: "SCHEDULED",
    score: null,
    round: "Operator practice",
    periodStartedAt: null,
    homeTeam: PRACTICE_HOME,
    awayTeam: PRACTICE_AWAY,
    competition: {
      id: "practice",
      sportId: "football",
      name: "Operator practice",
      shortName: "Practice",
      season: "Practice",
      format: "league",
      halfSeconds: PRACTICE_HALF_SECONDS,
      category: "men",
      description: "Mock match for operator applicants. Not a real match.",
      teamIds: [PRACTICE_HOME.id, PRACTICE_AWAY.id],
    },
    venue: { id: "practice", name: "Practice pitch", shortName: "Practice" },
    events: [],
  };
  const squad = Array.from({ length: 18 }, (_, i) => ({ playerId: `p${i + 1}`, shirt: i + 1, name: null }));
  return {
    assignment: { matchId: PRACTICE_MATCH_ID, operatorId: "practice", role: "PRIMARY", prep: { atVenue: true, teamsPresent: true, officialsReady: true } },
    match,
    squads: { home: squad, away: squad },
    lineups: { home: lineup(), away: lineup() },
  };
}

export function practiceInitialState(): OpMatchState {
  return {
    matchId: PRACTICE_MATCH_ID,
    phase: "SCHEDULED",
    clock: initialClock({ halfSeconds: PRACTICE_HALF_SECONDS, etHalfSeconds: 0 }),
    events: [],
    log: [],
    version: 0,
  };
}
