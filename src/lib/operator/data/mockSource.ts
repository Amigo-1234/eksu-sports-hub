import { getMatch } from "@/lib/data";
import type { AssignmentSeed } from "../types";
import { demoAssignments, demoOperator } from "./mock";
import type { OperatorDataSource } from "./source";

/** DEMO: a fixed mock operator and assignments over the public demo matches. */
export const mockOperatorDataSource: OperatorDataSource = {
  kind: "mock",
  async getCurrentOperator() {
    return demoOperator;
  },
  async getAssignmentSeeds(operator) {
    const mine = demoAssignments.filter((a) => a.operatorId === operator.id);
    const seeds = await Promise.all(
      mine.map(async (assignment) => {
        const match = await getMatch(assignment.matchId);
        return match ? { assignment, match } : null;
      }),
    );
    return seeds.filter((s): s is AssignmentSeed => s !== null);
  },
  async getAssignmentSeed(operator, matchId) {
    const assignment = demoAssignments.find((a) => a.operatorId === operator.id && a.matchId === matchId);
    if (!assignment) return null;
    const match = await getMatch(matchId);
    return match ? { assignment, match } : null;
  },
};
