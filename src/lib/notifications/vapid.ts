import "server-only";
import { createPublicKey, verify } from "node:crypto";
import webpush from "web-push";
import { serviceClient } from "@/lib/registration/server";
import { isValidVapidPublicKey, validateVapidPair, vapidPairValid, type VapidValidation } from "./vapid-check";

/*
 * The VAPID key pair lives in Supabase Vault (migration 20261009001800) and
 * is read through service_role functions only. The private half never
 * leaves the server; the browser gets the public half from
 * GET /api/notifications/vapid-key. Both halves always come from the same
 * Vault generation, so they cannot drift apart.
 */

export interface VapidPair {
  publicKey: string;
  privateKey: string;
}

const TTL = 5 * 60 * 1000;
let pairCache: { pair: VapidPair; at: number } | null = null;
let publicCache: { key: string; at: number } | null = null;

/** Both halves for signing, validated as a matching pair; null if missing or broken. */
export async function loadVapidPair(): Promise<VapidPair | null> {
  if (pairCache && Date.now() - pairCache.at < TTL) return pairCache.pair;
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db.rpc("service_vapid_keys");
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { public_key?: string | null; private_key?: string | null } | null;
  if (!row?.public_key || !row.private_key) return null;
  const pair = { publicKey: row.public_key, privateKey: row.private_key };
  if (!vapidPairValid(validateVapidPair(pair.publicKey, pair.privateKey))) return null;
  pairCache = { pair, at: Date.now() };
  return pair;
}

/** The public half only (never loads the private key). */
export async function loadVapidPublicKey(): Promise<string | null> {
  if (publicCache && Date.now() - publicCache.at < TTL) return publicCache.key;
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db.rpc("service_vapid_public_key");
  if (error || !isValidVapidPublicKey(data)) return null;
  publicCache = { key: data, at: Date.now() };
  return data;
}

export function vapidSubject(): string {
  return (process.env.VAPID_SUBJECT ?? "").trim();
}

export type VapidInitResult =
  | { ok: true; generated: true; validation: VapidValidation; stored: boolean; reason?: string }
  | { ok: false; generated: boolean; validation?: VapidValidation; stored: false; reason: string };

/**
 * One-time setup: generate a pair, validate it, and store both halves in
 * Vault in one call. Returns booleans only; the keys are never returned or
 * logged. Vault refuses to overwrite an existing pair. (Production was
 * initialised once through a temporary route; re-expose this only for a
 * deliberate rotation.)
 */
export async function initialiseVapidPair(): Promise<VapidInitResult> {
  const db = serviceClient();
  if (!db) return { ok: false, generated: false, stored: false, reason: "not configured" };
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  const validation = validateVapidPair(publicKey, privateKey);
  if (!vapidPairValid(validation)) return { ok: false, generated: true, validation, stored: false, reason: "validation failed" };
  const { data, error } = await db.rpc("service_vapid_init", { p_public: publicKey, p_private: privateKey });
  if (error) return { ok: false, generated: true, validation, stored: false, reason: "vault write failed" };
  const r = data as { created?: boolean; reason?: string } | null;
  pairCache = null;
  publicCache = null;
  return r?.created ? { ok: true, generated: true, validation, stored: true } : { ok: true, generated: true, validation, stored: false, reason: r?.reason ?? "unknown" };
}

/**
 * Dispatcher self-test: validates the Vault pair, signs a VAPID JWT with the
 * private key exactly as a real push would, and verifies that signature with
 * the public key the browser receives. Booleans only.
 */
export async function vapidSelfTest() {
  const pair = await loadVapidPair();
  const subject = vapidSubject();
  const out = {
    loaded: Boolean(pair),
    validation: null as VapidValidation | null,
    subjectScheme: /^mailto:/i.test(subject) ? "mailto" : /^https:/i.test(subject) ? "https" : "invalid",
    signs: false,
    signatureVerifies: false,
    browserKeyMatches: false,
  };
  if (!pair) return out;
  out.validation = validateVapidPair(pair.publicKey, pair.privateKey);
  out.browserKeyMatches = (await loadVapidPublicKey()) === pair.publicKey;
  try {
    const headers = webpush.getVapidHeaders("https://web.push.apple.com", subject, pair.publicKey, pair.privateKey, "aes128gcm");
    out.signs = true;
    const jwt = /t=([^,\s]+)/.exec(headers.Authorization)?.[1] ?? "";
    const [h, p, sig] = jwt.split(".");
    const pub = Buffer.from(pair.publicKey, "base64url");
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") },
      format: "jwk",
    });
    out.signatureVerifies = verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig ?? "", "base64url"));
  } catch {
    // reported as false
  }
  return out;
}
