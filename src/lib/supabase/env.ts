/**
 * Public Supabase connection settings (URL + publishable key). Both are safe
 * in the browser: every privilege is enforced by Postgres (RLS + RPC checks).
 * The secret key never appears here — see src/lib/admin/authAdmin.ts.
 */
export type SupabaseEnv = { ok: true; url: string; publishableKey: string } | { ok: false; error: string };

export function supabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set." };
  }
  return { ok: true, url, publishableKey };
}
