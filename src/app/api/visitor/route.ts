import { NextResponse } from "next/server";
import { DATA_SOURCE_KIND } from "@/lib/data";
import { deviceToken, setDeviceCookie } from "@/lib/notifications/server";
import { callerKey, publicMessage, serviceClient } from "@/lib/registration/server";
import { parseVisitorRequest } from "@/lib/visitor/types";
import { isSameOrigin } from "@/lib/same-origin";

/*
 * /api/visitor — the public site's light sign-in ("What should we call you?").
 *
 * GET               → { known, name? } for this browser's device cookie.
 * POST {t:"join"}   → saves the name (and optional email/phone) for this device,
 *                     creating the anonymous device first when there is none.
 * POST {t:"seen"}   → counts today's visit (the browser sends it once a day).
 *
 * The device is the anonymous httpOnly cookie shared with match alerts and
 * audience counts; all writes go through service_role functions.
 */

export const dynamic = "force-dynamic";

const unknown = () => NextResponse.json({ known: false });

export async function GET() {
  const db = DATA_SOURCE_KIND === "live" ? serviceClient() : null;
  const token = await deviceToken();
  if (!db || !token) return unknown();
  const { data, error } = await db.rpc("service_visitor_state", {
    p_token: token,
  });
  return error ? unknown() : NextResponse.json(data);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const db = DATA_SOURCE_KIND === "live" ? serviceClient() : null;
  if (!db) return NextResponse.json({ error: "Sign-in is not available right now." }, { status: 503 });

  let req;
  try {
    const text = await request.text();
    if (text.length > 1024) return NextResponse.json({ error: "Too long" }, { status: 413 });
    req = parseVisitorRequest(JSON.parse(text));
  } catch {
    req = null;
  }
  if (!req) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let token = await deviceToken();
  if (req.t === "seen") {
    if (!token) return unknown();
    const { data, error } = await db.rpc("service_visitor_seen", {
      p_token: token,
    });
    return error ? unknown() : NextResponse.json(data);
  }

  const rateKey = await callerKey();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) {
      const reg = await db.rpc("service_audience_register", {
        p_rate_key: rateKey,
      });
      if (reg.error) {
        return NextResponse.json(
          {
            error: publicMessage(reg.error, "Sign-in is not available right now."),
          },
          { status: reg.error.code === "EK429" ? 429 : 503 },
        );
      }
      token = (reg.data as { token: string }).token;
      await setDeviceCookie(token);
    }
    const { data, error } = await db.rpc("service_visitor_join", {
      p_token: token,
      p_name: req.name,
      p_contact: req.contact,
      p_rate_key: rateKey,
    });
    if (!error) return NextResponse.json(data);
    if (error.code !== "EK401") {
      const status = error.code === "EK429" ? 429 : error.code === "EK422" ? 422 : 503;
      return NextResponse.json({ error: publicMessage(error, "Sign-in is not available right now.") }, { status });
    }
    token = null; // device unknown (e.g. removed): issue a fresh one once
  }
  return NextResponse.json({ error: "Sign-in is not available right now." }, { status: 503 });
}
