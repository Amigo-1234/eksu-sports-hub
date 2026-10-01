import { NextResponse } from "next/server";
import { NotifyError, pushNotificationsEnabled, withDevice } from "@/lib/notifications/server";

/*
 * POST /api/notifications/subscription — the service worker reports a
 * renewed push subscription (pushsubscriptionchange). Same-origin only; the
 * device is the httpOnly cookie; it can only replace ITS OWN subscription,
 * and only if this browser already registered a device.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!pushNotificationsEnabled()) return NextResponse.json({ ok: false }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ ok: false }, { status: 403 });
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.slice(0, 1024) : "";
  if (!/^https:\/\/\S+$/.test(endpoint) || typeof body.keys?.p256dh !== "string" || typeof body.keys?.auth !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const r = await withDevice("service_notify_set_subscription", { p_endpoint: endpoint, p_p256dh: body.keys.p256dh, p_auth: body.keys.auth }, { create: false });
    return NextResponse.json({ ok: r !== null }, { status: r === null ? 404 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof NotifyError ? e.message : "failed" }, { status: 400 });
  }
}
