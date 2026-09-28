import "server-only";
import { getMatch } from "@/lib/data";
import type { AssignmentSeed, Operator } from "../types";
import { demoAssignments, demoOperator } from "./mock";

/**
 * Operator data access (server). Mock today; later these become
 * authenticated queries scoped to the signed-in operator (RLS).
 */

export async function getCurrentOperator(): Promise<Operator> {
  return demoOperator;
}

/** Only matches assigned to the operator — never anything else. */
export async function getAssignmentSeeds(operatorId: string): Promise<AssignmentSeed[]> {
  const mine = demoAssignments.filter((a) => a.operatorId === operatorId);
  const seeds = await Promise.all(
    mine.map(async (assignment) => {
      const match = await getMatch(assignment.matchId);
      return match ? { assignment, match } : null;
    }),
  );
  return seeds.filter((s): s is AssignmentSeed => s !== null);
}

export async function getAssignmentSeed(operatorId: string, matchId: string): Promise<AssignmentSeed | null> {
  const assignment = demoAssignments.find((a) => a.operatorId === operatorId && a.matchId === matchId);
  if (!assignment) return null;
  const match = await getMatch(matchId);
  return match ? { assignment, match } : null;
}
