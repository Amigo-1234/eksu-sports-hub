/**
 * Which operator backend is active. Chosen deliberately via
 * NEXT_PUBLIC_OPERATOR_BACKEND — there is no silent fallback.
 *
 *   supabase  real authenticated backend (requires Supabase env vars)
 *   mock      in-browser demo backend (explicit opt-in only)
 *
 * Unset: development uses `mock` (with a visible DEMO banner); production
 * refuses to run the operator console until a backend is configured.
 */
export type OperatorBackendKind = "mock" | "supabase";

export type BackendConfig =
  | { ok: true; kind: "mock" }
  | { ok: true; kind: "supabase"; url: string; publishableKey: string }
  | { ok: false; error: string };

export function operatorBackendConfig(): BackendConfig {
  const raw = process.env.NEXT_PUBLIC_OPERATOR_BACKEND;
  const kind = raw ?? (process.env.NODE_ENV === "production" ? undefined : "mock");
  if (kind === "mock") return { ok: true, kind: "mock" };
  if (kind === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      return {
        ok: false,
        error: "NEXT_PUBLIC_OPERATOR_BACKEND=supabase but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing.",
      };
    }
    return { ok: true, kind: "supabase", url, publishableKey };
  }
  return {
    ok: false,
    error: raw
      ? `Unknown NEXT_PUBLIC_OPERATOR_BACKEND "${raw}" (expected "supabase" or "mock").`
      : "The operator backend is not configured. Set NEXT_PUBLIC_OPERATOR_BACKEND (see .env.example).",
  };
}
