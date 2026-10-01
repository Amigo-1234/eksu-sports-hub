import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendAll, vapidConfigured, type ClaimedDelivery } from "@/lib/notifications/push";
import { pushNotificationsEnabled } from "@/lib/notifications/server";
import { serviceClient } from "@/lib/registration/server";

/*
 * POST /api/notifications/dispatch — the notification worker.
 *
 * Called by Postgres (pg_net, right after an outbox commit) and by pg_cron
 * every minute, with `Authorization: Bearer NOTIFICATIONS_DISPATCH_SECRET`.
 * Each pass: enqueue due reminders, fan out new intents, lease due
 * deliveries, send them, report results. Safe to call concurrently and
 * repeatedly (leases + unique deliveries); never touches match state.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || secret.length < 32 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!pushNotificationsEnabled() || !vapidConfigured()) return NextResponse.json({ ok: true, skipped: "disabled" });
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });

  const started = Date.now();
  const totals = { sent: 0, retry: 0, gone: 0, failed: 0, passes: 0 };
  while (Date.now() - started < 40_000) {
    const claim = await db.rpc("service_notification_claim", { p_limit: 200 });
    if (claim.error) return NextResponse.json({ ok: false, error: "claim failed" }, { status: 500 });
    const rows = (claim.data as ClaimedDelivery[] | null) ?? [];
    totals.passes++;
    if (rows.length === 0) break;
    const results = await sendAll(rows);
    const rep = await db.rpc("service_notification_report", { p_results: results });
    if (rep.error) return NextResponse.json({ ok: false, error: "report failed" }, { status: 500 });
    const r = rep.data as { sent: number; retry: number; gone: number; failed: number };
    totals.sent += r.sent;
    totals.retry += r.retry;
    totals.gone += r.gone;
    totals.failed += r.failed;
  }
  return NextResponse.json({ ok: true, ...totals });
}
