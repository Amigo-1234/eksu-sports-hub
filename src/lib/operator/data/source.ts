import type { AssignmentSeed, Operator } from "../types";

/** Server-side operator reads. Implemented by the mock and Supabase adapters. */
export interface OperatorDataSource {
  kind: "mock" | "supabase";
  /** Signed-in user, or null when signed out. */
  getCurrentOperator(): Promise<Operator | null>;
  /** Only the operator's own active assignments. */
  getAssignmentSeeds(operator: Operator): Promise<AssignmentSeed[]>;
  /** One assignment with full console context, or null if not assigned. */
  getAssignmentSeed(operator: Operator, matchId: string): Promise<AssignmentSeed | null>;
}
