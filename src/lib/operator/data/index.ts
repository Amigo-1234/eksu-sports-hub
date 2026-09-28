import "server-only";
import { operatorBackendConfig } from "../backend";
import { mockOperatorDataSource } from "./mockSource";
import type { OperatorDataSource } from "./source";
import { supabaseOperatorDataSource } from "./supabaseSource";

export type { OperatorDataSource } from "./source";

/** The configured operator data source. Never falls back silently. */
export function operatorDataSource(): OperatorDataSource {
  const cfg = operatorBackendConfig();
  if (!cfg.ok) throw new Error(cfg.error);
  return cfg.kind === "supabase" ? supabaseOperatorDataSource : mockOperatorDataSource;
}

export const OPERATOR_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];
export const hasOperatorAccess = (roles: string[]) => roles.some((r) => OPERATOR_ROLES.includes(r));
