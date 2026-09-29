import { supabaseEnv } from "../supabase/env";

/**
 * Which public data source serves the site. Chosen deliberately — there is no
 * silent fallback to demo data in production.
 *
 *   PUBLIC_DATA_SOURCE=supabase  real data (default whenever Supabase is configured)
 *   PUBLIC_DATA_SOURCE=mock      demo data, for development/testing only;
 *                                refused on a Vercel production deployment
 *
 * Unset and Supabase not configured: development uses mock (with the visible
 * "Preview build" notice); production is an error, never mock.
 */
export type PublicDataConfig = { kind: "supabase" } | { kind: "mock" } | { kind: "error"; error: string };

export function publicDataConfig(): PublicDataConfig {
  const raw = process.env.PUBLIC_DATA_SOURCE;
  const production = process.env.NODE_ENV === "production";
  const vercelProduction = process.env.VERCEL_ENV === "production";
  if (raw === "mock") {
    if (vercelProduction) return { kind: "error", error: "PUBLIC_DATA_SOURCE=mock is not allowed in production." };
    return { kind: "mock" };
  }
  if (raw && raw !== "supabase") return { kind: "error", error: `Unknown PUBLIC_DATA_SOURCE "${raw}" (expected "supabase" or "mock").` };
  if (supabaseEnv().ok) return { kind: "supabase" };
  if (raw === "supabase" || production) {
    return { kind: "error", error: "The public data source is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)." };
  }
  return { kind: "mock" };
}
