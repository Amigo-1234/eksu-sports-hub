import { NextResponse } from "next/server";
import { dispatchAuthorised } from "@/lib/notifications/dispatch-auth";
import { sendAll, type ClaimedDelivery } from "@/lib/notifications/push";
import { pushNotificationsEnabled } from "@/lib/notifications/server";
import { loadVapidPair, vapidSelfTest, vapidSubject } from "@/lib/notifications/vapid";
import { serviceClient } from "@/lib/registration/server";

/*
 * POST /api/notifications/dispatch — the notification worker.
 *
 * Called by Postgres (pg_net, right after an outbox commit) and by pg_cron
 * every minute, with `Authorization: Bearer NOTIFICATIONS_DISPATCH_SECRET`.
 * Each pass: enqueue due reminders, fan out new intents, lease due
 * deliveries, send them, report results. Safe to call concurrently and
 * repeatedly (leases + unique deliveries); never touches match state.
 * `?check=vapid` only runs the VAPID self-test (booleans, no keys) and sends nothing.
 * The VAPID pair is read from Supabase Vault.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!dispatchAuthorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (new URL(request.url).searchParams.get("check") === "vapid") return NextResponse.json({ ok: true, vapid: await vapidSelfTest() });
  if (!pushNotificationsEnabled()) return NextResponse.json({ ok: true, skipped: "disabled" });
  const pair = await loadVapidPair();
  const subject = vapidSubject();
  if (!pair || !subject) return NextResponse.json({ ok: true, skipped: "no vapid keys" });
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
    const results = await sendAll(rows, pair, subject);
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
