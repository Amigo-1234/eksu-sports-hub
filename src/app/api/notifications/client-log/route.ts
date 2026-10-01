import { NextResponse } from "next/server";

/*
 * POST /api/notifications/client-log — diagnostics when a browser fails to
 * set up push (which step, the browser's error name/message). Logged to the
 * server log only; nothing is stored or returned. Only a fixed set of short,
 * non-secret fields is accepted.
 */

export const dynamic = "force-dynamic";

const STEPS = new Set(["register", "ready", "key", "getSubscription", "subscribe", "serialize", "save"]);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).replace(/[\r\n]+/g, " ") : undefined);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 1024) return new NextResponse(null, { status: 413 });
    const b = JSON.parse(text) as Record<string, unknown>;
    if (!STEPS.has(String(b.step))) return new NextResponse(null, { status: 400 });
    console.warn(
      "[push-client] setup failed",
      JSON.stringify({
        step: b.step,
        name: clip(b.name, 60),
        message: clip(b.message, 200),
        permission: clip(b.permission, 20),
        platform: clip(b.platform, 20),
        standalone: b.standalone === true,
        hasPushManager: b.hasPushManager === true,
        controlled: b.controlled === true,
        ua: clip(request.headers.get("user-agent"), 160),
      }),
    );
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  return new NextResponse(null, { status: 204 });
}
