import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { supabaseEnv } from "@/lib/supabase/env";
import { isUuid } from "./rules";

/**
 * Server side of public registration — the second (and last) place the
 * Supabase secret key is read (see also src/lib/admin/authAdmin.ts).
 *
 * - server-only: this module cannot be bundled for the browser
 * - SUPABASE_SECRET_KEY is never prefixed NEXT_PUBLIC, never logged and
 *   never returned; it is used for exactly:
 *     · uploading/removing documents in the private `registration-documents`
 *       bucket (clients have no write policy at all), and
 *     · calling the service_* registration RPCs, which only service_role may
 *       execute (submit, status lookup, rate limiting).
 * - Draft tokens and rate-limit keys are HMACs with a key derived from the
 *   secret, so neither reveals it nor can be forged by a browser.
 */

export const DOCUMENT_BUCKET = "registration-documents";
const DRAFT_TTL_SECONDS = 6 * 60 * 60;

export function registrationConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY) && supabaseEnv().ok;
}

export function serviceClient(): SupabaseClient | null {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!env.ok || !secret) return null;
  return createClient(env.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

function hmac(label: string, value: string): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("registration is not configured");
  const key = createHmac("sha256", secret).update(`eksu-registration:${label}`).digest();
  return createHmac("sha256", key).update(value).digest("base64url");
}

/**
 * A draft: the registration id is chosen up front so documents can be
 * stored under it before the form is submitted. The token binds the id to
 * the window and expires; uploads and the submission both require it.
 */
export function issueDraft(windowId: string): { registrationId: string; token: string } {
  const registrationId = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + DRAFT_TTL_SECONDS;
  const body = `${registrationId}.${windowId}.${exp}`;
  return { registrationId, token: `${body}.${hmac("draft", body)}` };
}

export function verifyDraft(token: unknown): { registrationId: string; windowId: string } | null {
  if (typeof token !== "string" || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [registrationId, windowId, exp, sig] = parts;
  if (!isUuid(registrationId) || !isUuid(windowId) || !/^\d{9,11}$/.test(exp)) return null;
  const expected = Buffer.from(hmac("draft", `${registrationId}.${windowId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return { registrationId, windowId };
}

/** Rate-limit key: a keyed hash of the caller's address (the raw IP is never stored). */
export async function callerKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return hmac("caller", ip);
}

export type ServiceError = { code?: string; message?: string };

/** Messages safe to show the public: our own EK4xx messages, nothing internal. */
export function publicMessage(e: ServiceError | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (e?.code?.startsWith("EK") && e.message) return e.message;
  return fallback;
}

/** Remove documents of drafts that were never submitted (best effort, at most once a minute per instance). */
let lastSweep = 0;
export async function sweepAbandonedDocuments(db: SupabaseClient): Promise<void> {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  try {
    const { data } = await db.rpc("service_orphan_documents", { p_older_than: "24 hours", p_limit: 100 });
    const names = (data as string[] | null) ?? [];
    if (names.length) await db.storage.from(DOCUMENT_BUCKET).remove(names);
  } catch {
    // Housekeeping only; never block a visitor.
  }
}
