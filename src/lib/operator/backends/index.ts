import { operatorBackendConfig } from "../backend";
import { mockOperatorBackend } from "./mock";
import { supabaseOperatorBackend } from "./supabase";
import type { OperatorBackend } from "./types";

/** The configured backend. Throws (never falls back) when misconfigured. */
export function getOperatorBackend(): OperatorBackend {
  const cfg = operatorBackendConfig();
  if (!cfg.ok) throw new Error(cfg.error);
  return cfg.kind === "supabase" ? supabaseOperatorBackend : mockOperatorBackend;
}
