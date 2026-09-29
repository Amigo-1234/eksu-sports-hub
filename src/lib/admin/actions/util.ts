import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeDbError, type DbError } from "../errors";
import { assertAdmin, type AdminIdentity } from "../permissions";
import type { ActionState } from "../types";

/** Thrown inside an action body to report a validation problem to the form. */
export class Invalid extends Error {}

export const ok = (message: string, data?: Record<string, string>): ActionState => ({ ok: true, message, data, at: Date.now() });
export const fail = (error: string): ActionState => ({ ok: false, error, at: Date.now() });

/**
 * Wraps every admin mutation: re-verifies ADMIN for this request (server
 * actions are reachable by direct POST), then runs the body as the signed-in
 * admin so Postgres enforces RLS/RPC checks and writes the audit trail.
 */
export async function adminAction(
  body: (ctx: { db: SupabaseClient; admin: AdminIdentity }) => Promise<ActionState>,
): Promise<ActionState> {
  const auth = await assertAdmin();
  if (!auth.ok) return fail(auth.error);
  try {
    const db = await createSupabaseServerClient();
    return await body({ db, admin: auth.identity });
  } catch (e) {
    if (e instanceof Invalid) return fail(e.message);
    // Next.js control flow (redirect/notFound) must propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[admin action]", e instanceof Error ? e.message : "unknown error");
    return fail("Something went wrong. Try again.");
  }
}

/** Throws a readable message when a Supabase call failed. */
export function check<T>(res: { data: T; error: DbError | null }): T {
  if (res.error) throw new Invalid(describeDbError(res.error));
  return res.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function text(fd: FormData, key: string, opts: { label: string; required?: boolean; max?: number } = { label: key }): string {
  const v = String(fd.get(key) ?? "").trim();
  if (opts.required && !v) throw new Invalid(`${opts.label} is required.`);
  if (v.length > (opts.max ?? 200)) throw new Invalid(`${opts.label} is too long (max ${opts.max ?? 200} characters).`);
  return v;
}

export function id(fd: FormData, key: string, label: string): string {
  const v = String(fd.get(key) ?? "").trim();
  if (!UUID.test(v)) throw new Invalid(`${label} is required.`);
  return v;
}

export function optionalId(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) return null;
  if (!UUID.test(v)) throw new Invalid("An invalid selection was submitted.");
  return v;
}

export function int(fd: FormData, key: string, label: string, min: number, max: number): number {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < min || n > max) throw new Invalid(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}

export const bool = (fd: FormData, key: string) => ["on", "true", "1"].includes(String(fd.get(key) ?? ""));

export function oneOf<T extends string>(fd: FormData, key: string, allowed: readonly T[], label: string): T {
  const v = String(fd.get(key) ?? "") as T;
  if (!allowed.includes(v)) throw new Invalid(`Choose a valid ${label}.`);
  return v;
}

export function date(fd: FormData, key: string, label: string): string {
  const v = String(fd.get(key) ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Invalid(`${label} must be a valid date.`);
  return v;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
