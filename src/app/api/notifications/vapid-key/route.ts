import { NextResponse } from "next/server";
import { pushNotificationsEnabled } from "@/lib/notifications/server";
import { loadVapidPublicKey } from "@/lib/notifications/vapid";

/*
 * GET /api/notifications/vapid-key — the browser's applicationServerKey.
 *
 * Returns ONLY `{ publicKey }`, read from Supabase Vault through a
 * service_role function that never touches the private key. Validated as an
 * uncompressed P-256 point before it is served.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  if (!pushNotificationsEnabled()) return NextResponse.json({ ok: false }, { status: 404 });
  const publicKey = await loadVapidPublicKey();
  if (!publicKey) return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "private, max-age=300" } });
}
