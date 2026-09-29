import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Admin access checks. Roles are read from Postgres for the session's own
 * user (auth.getUser() validates the JWT with Supabase Auth) — never from
 * anything the client sends. Postgres re-checks ADMIN on every write anyway:
 * RLS policies and admin_* RPCs call private.has_role('ADMIN').
 */
export type AdminIdentity = { id: string; email: string; displayName: string; roles: string[] };

export type AdminSession =
  | { kind: "unconfigured"; error: string }
  | { kind: "anonymous" }
  | { kind: "deactivated"; identity: AdminIdentity }
  | { kind: "forbidden"; identity: AdminIdentity }
  | { kind: "admin"; identity: AdminIdentity };

/** Resolved once per request (React cache), shared by layout, page and data calls. */
export const getAdminSession = cache(async (): Promise<AdminSession> => {
  await connection(); // admin data is per-request, never prerendered
  const env = supabaseEnv();
  if (!env.ok) return { kind: "unconfigured", error: env.error };
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: "anonymous" };

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("display_name, deactivated_at").eq("id", auth.user.id).maybeSingle(),
    supabase.from("user_roles").select("roles(code)").eq("user_id", auth.user.id),
  ]);
  const roles = (roleRows ?? [])
    .map((r) => (r.roles as unknown as { code: string } | null)?.code)
    .filter((c): c is string => Boolean(c));
  const identity: AdminIdentity = {
    id: auth.user.id,
    email: auth.user.email ?? "",
    displayName: profile?.display_name || auth.user.email || "Staff",
    roles,
  };
  if (profile?.deactivated_at) return { kind: "deactivated", identity };
  if (!roles.includes("ADMIN")) return { kind: "forbidden", identity };
  return { kind: "admin", identity };
});

/**
 * For admin pages and data loaders: returns the admin or leaves the route
 * (signed out → /admin/login, signed in without ADMIN → /admin/unauthorized).
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const s = await getAdminSession();
  if (s.kind === "admin") return s.identity;
  if (s.kind === "anonymous") redirect("/admin/login");
  redirect("/admin/unauthorized");
}

/** For server actions: never redirects, reports why the caller is refused. */
export async function assertAdmin(): Promise<{ ok: true; identity: AdminIdentity } | { ok: false; error: string }> {
  const s = await getAdminSession();
  if (s.kind === "admin") return { ok: true, identity: s.identity };
  if (s.kind === "anonymous") return { ok: false, error: "Your session has expired. Sign in again." };
  if (s.kind === "unconfigured") return { ok: false, error: "The backend is not configured." };
  return { ok: false, error: "Administrator access required." };
}
