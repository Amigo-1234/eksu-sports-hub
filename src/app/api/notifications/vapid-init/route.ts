import { NextResponse } from "next/server";
import { dispatchAuthorised } from "@/lib/notifications/dispatch-auth";
import { initialiseVapidPair } from "@/lib/notifications/vapid";

/*
 * POST /api/notifications/vapid-init — TEMPORARY one-time setup.
 *
 * Generates a VAPID pair server-side, validates it and stores both halves in
 * Supabase Vault in one call. Requires the dispatcher secret (anonymous
 * callers get 401). Responds with booleans only; the keys are never returned
 * or logged. Vault refuses to overwrite an existing pair, so repeat calls
 * change nothing. Remove this route once production is initialised.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!dispatchAuthorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await initialiseVapidPair();
  return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}
