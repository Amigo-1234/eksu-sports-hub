import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "../permissions";

/**
 * Every admin read goes through here: the caller is verified as ADMIN first
 * (redirecting otherwise), then queries run as that user so RLS still applies.
 */
export async function adminDb() {
  const admin = await requireAdmin();
  const db = await createSupabaseServerClient();
  return { admin, db };
}

/** Throws a readable error for failed reads (rendered by admin error.tsx). */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}.`);
  return res.data as T;
}

export const TEAM_REF = "id, name, short_name, code";
