import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { operatorBackendConfig } from "./backend";
import { hasOperatorAccess, operatorDataSource } from "./data";
import type { Operator } from "./types";

export type OperatorSession =
  | { configured: false; error: string; operator: null; allowed: false }
  | { configured: true; operator: Operator; allowed: boolean };

/**
 * Signed-in operator for a console page. Redirects to login when signed out.
 * Never throws on a missing backend config: the layout shows that state and
 * pages render nothing (so builds and deploys without Supabase still work).
 * Pages only decide what to render — every write is re-authorised in Postgres.
 */
export async function requireOperator(): Promise<OperatorSession> {
  await connection(); // operator data is per-request, never prerendered
  const cfg = operatorBackendConfig();
  if (!cfg.ok) return { configured: false, error: cfg.error, operator: null, allowed: false };
  const operator = await operatorDataSource().getCurrentOperator();
  if (!operator) redirect("/op/login");
  return { configured: true, operator, allowed: hasOperatorAccess(operator.roles) };
}
