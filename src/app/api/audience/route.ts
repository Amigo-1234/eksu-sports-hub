import { NextResponse } from "next/server";
import { parseAudienceRequest } from "@/lib/audience/types";
import { DATA_SOURCE_KIND } from "@/lib/data";
import { deviceToken, setDeviceCookie } from "@/lib/notifications/server";
import { callerKey, serviceClient } from "@/lib/registration/server";

/*
 * POST /api/audience — a public match page saying "this device is viewing
 * match X" (start), "still here" (beat) or "gone" (end; sent with
 * sendBeacon). The device is the anonymous httpOnly cookie shared with match
 * alerts; the server derives every number. Responses never contain audience
 * figures, and every failure is swallowed: analytics must never affect the
 * match page.
 */

export const dynamic = "force-dynamic";

const quiet = (status = 204) => new NextResponse(null, { status });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return quiet(403);
  if (DATA_SOURCE_KIND !== "live") return quiet();
  const db = serviceClient();
  if (!db) return quiet();

  let req;
  try {
    // sendBeacon posts text/plain; parse the body ourselves.
    const text = await request.text();
    if (text.length > 512) return quiet(413);
    req = parseAudienceRequest(JSON.parse(text));
  } catch {
    req = null;
  }
  if (!req) return quiet(400);

  try {
    let token = await deviceToken();
    if (req.t !== "start") {
      if (!token) return NextResponse.json({ restart: true });
      const { data, error } = await db.rpc(req.t === "beat" ? "service_audience_beat" : "service_audience_end", {
        p_token: token,
        p_session_id: req.session,
      });
      if (error) return error.code === "EK401" ? NextResponse.json({ restart: true }) : quiet();
      return req.t === "beat" ? NextResponse.json({ restart: (data as { restart?: boolean } | null)?.restart === true }) : quiet();
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      if (!token) {
        const reg = await db.rpc("service_audience_register", { p_rate_key: await callerKey() });
        if (reg.error) return quiet(reg.error.code === "EK429" ? 429 : 204);
        token = (reg.data as { token: string }).token;
        await setDeviceCookie(token);
      }
      const { data, error } = await db.rpc("service_audience_start", { p_token: token, p_match_id: req.match });
      if (!error) return NextResponse.json({ session: (data as { session_id: string }).session_id });
      if (error.code !== "EK401") return quiet(error.code === "EK429" ? 429 : 204);
      token = null; // device unknown (e.g. removed): issue a fresh one once
    }
    return quiet();
  } catch {
    return quiet();
  }
}
