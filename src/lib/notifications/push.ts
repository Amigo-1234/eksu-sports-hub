import "server-only";
import webpush from "web-push";
import { classify, type DeliveryResult } from "./delivery";

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

export function vapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function sendAll(rows: ClaimedDelivery[], concurrency = 10): Promise<DeliveryResult[]> {
  const details = {
    subject: process.env.VAPID_SUBJECT!,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
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
