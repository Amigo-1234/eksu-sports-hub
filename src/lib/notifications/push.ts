import "server-only";
import { createECDH } from "node:crypto";
import webpush from "web-push";
import { classify, type DeliveryResult } from "./delivery";
import { normaliseVapidKey } from "./flag";

/*
 * Standard Web Push (RFC 8030 + VAPID RFC 8292, aes128gcm payloads) through
 * the `web-push` library. The private VAPID key is server-only.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  browser key (applicationServerKey)
 *   VAPID_PRIVATE_KEY             server secret — never NEXT_PUBLIC, never logged
 *   VAPID_SUBJECT                 mailto: or https: contact for push services
 */

export interface ClaimedDelivery {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: { title: string; body: string; url: string; tag: string; type: string; match_id: string };
  ttl: number;
  urgency: "high" | "normal";
}
export type { DeliveryResult };

function vapidDetails() {
  return {
    subject: (process.env.VAPID_SUBJECT ?? "").trim(),
    publicKey: normaliseVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    privateKey: normaliseVapidKey(process.env.VAPID_PRIVATE_KEY),
  };
}

export function vapidConfigured(): boolean {
  const d = vapidDetails();
  return Boolean(d.publicKey && d.privateKey && d.subject);
}

function b64urlBytes(v: string): Buffer | null {
  return /^[A-Za-z0-9_-]+$/.test(v) ? Buffer.from(v, "base64url") : null;
}

/** Shape of a configured key (character classes and lengths only, never the value). */
function keyFormat(raw: string | undefined) {
  const v = raw ?? "";
  const t = v.trim();
  return {
    rawLength: v.length,
    normalisedLength: normaliseVapidKey(v).length,
    whitespace: v !== t || /\s/.test(t),
    quoted: /^["'][\s\S]*["']$/.test(t),
    padding: /=/.test(t),
    standardAlphabet: /[+/]/.test(t),
    otherChars: /[^A-Za-z0-9_\-+/="'\s]/.test(t),
    // Code points of characters that can never be part of a key (e.g. a
    // smart-punctuation dash), so they reveal nothing about the key itself.
    foreignChars: [...new Set(t.match(/[^A-Za-z0-9_\-+/="'\s]/gu) ?? [])].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")),
  };
}

/**
 * Self-check of the VAPID configuration for the dispatcher's diagnostics.
 * Booleans and lengths only; never key material.
 */
export function vapidStatus() {
  const d = vapidDetails();
  const pub = b64urlBytes(d.publicKey);
  const priv = b64urlBytes(d.privateKey);
  let webPushAccepts = false;
  let pairMatches = false;
  try {
    webpush.getVapidHeaders("https://web.push.apple.com", d.subject, d.publicKey, d.privateKey, "aes128gcm");
    webPushAccepts = true;
  } catch {
    // reported as false
  }
  try {
    if (pub && priv) {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(priv);
      pairMatches = ecdh.getPublicKey().equals(pub);
    }
  } catch {
    // reported as false
  }
  return {
    publicKeyBytes: pub?.length ?? 0,
    publicKeyUncompressed: pub?.[0] === 4,
    publicKeyFormat: keyFormat(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    privateKeyBytes: priv?.length ?? 0,
    privateKeyFormat: keyFormat(process.env.VAPID_PRIVATE_KEY),
    subjectScheme: /^mailto:/i.test(d.subject) ? "mailto" : /^https:/i.test(d.subject) ? "https" : "invalid",
    webPushAccepts,
    pairMatches,
  };
}

export async function sendAll(rows: ClaimedDelivery[], concurrency = 10): Promise<DeliveryResult[]> {
  const details = vapidDetails();
  const out: DeliveryResult[] = [];
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const d = rows[i++];
      try {
        const res = await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify({ title: d.payload.title, body: d.payload.body, url: d.payload.url, tag: d.payload.tag, type: d.payload.type }),
          { vapidDetails: details, TTL: d.ttl, urgency: d.urgency, timeout: 10_000, contentEncoding: "aes128gcm" },
        );
        out.push({ id: d.id, result: classify(res.statusCode), code: res.statusCode });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        out.push({ id: d.id, result: classify(status), code: status, error: (e as Error).message?.slice(0, 160) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return out;
}
