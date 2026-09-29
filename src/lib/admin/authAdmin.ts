import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase Auth Admin API — the ONLY place the secret key is read.
 *
 * - server-only (this module cannot be imported into client bundles)
 * - SUPABASE_SECRET_KEY is never prefixed NEXT_PUBLIC, never logged and never
 *   returned; callers only receive the narrow results below
 * - used for exactly three things: invite links, password-reset links, and
 *   banning/unbanning sign-in for deactivated staff
 *
 * Every caller must already have verified ADMIN (assertAdmin) — and roles are
 * still granted through admin_* RPCs as the signed-in admin, so Postgres
 * re-checks and audits them.
 */
export function staffAccountsConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY) && supabaseEnv().ok;
}

function adminClient(): SupabaseClient | null {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!env.ok || !secret) return null;
  return createClient(env.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type LinkResult =
  | { ok: true; userId: string; tokenHash: string; type: "invite" | "recovery" }
  | { ok: false; error: string };

const NOT_CONFIGURED =
  "Staff account creation is not configured on this server (SUPABASE_SECRET_KEY is missing). See docs/ADMIN.md.";

function friendly(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("already") && m.includes("registered")) return "An account with that email already exists. Send a password-reset link instead.";
  if (m.includes("invalid") && m.includes("email")) return "That email address is not valid.";
  if (m.includes("not found")) return "No account exists for that email.";
  return "The account service rejected the request. Try again.";
}

/** Creates the account (if new) and returns a one-time invite token hash. */
export async function createInviteLink(email: string, displayName: string): Promise<LinkResult> {
  const client = adminClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { display_name: displayName } },
  });
  if (error || !data.user || !data.properties?.hashed_token) return { ok: false, error: friendly(error?.message) };
  return { ok: true, userId: data.user.id, tokenHash: data.properties.hashed_token, type: "invite" };
}

/** One-time password-reset token hash for an existing account. */
export async function createRecoveryLink(email: string): Promise<LinkResult> {
  const client = adminClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await client.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.user || !data.properties?.hashed_token) return { ok: false, error: friendly(error?.message) };
  return { ok: true, userId: data.user.id, tokenHash: data.properties.hashed_token, type: "recovery" };
}

/**
 * Blocks (or restores) sign-in for a deactivated staff member. Postgres
 * already denies every role-based permission via profiles.deactivated_at;
 * this additionally ends their ability to get new sessions.
 */
export async function setSignInBlocked(userId: string, blocked: boolean): Promise<{ ok: boolean; error?: string }> {
  const client = adminClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await client.auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}
