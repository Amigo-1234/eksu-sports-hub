import { NextResponse } from "next/server";
import { DATA_SOURCE_KIND } from "@/lib/data";
import { parseAction, parseTarget } from "@/lib/fan/types";
import { findStory } from "@/lib/news/dashboard";
import { deviceToken, setDeviceCookie } from "@/lib/notifications/server";
import { callerKey, publicMessage, serviceClient } from "@/lib/registration/server";

/*
 * /api/fan — Fan Zone for matches and news stories.
 *
 * GET  ?kind=match|news&id=…   → likes, comments (with replies), vote counts, and
 *                                 what this browser has done (from the device cookie).
 * POST { kind, id, action, … } → like / unlike / vote / comment / like_comment /
 *                                 unlike_comment / report / delete (own comment).
 *
 * Identity is the anonymous httpOnly device cookie shared with alerts and the
 * light sign-in; commenting needs a name (the database enforces it). All
 * writes go through service_role functions that rate-limit per device.
 */

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { EK401: 401, EK403: 403, EK404: 404, EK409: 409, EK422: 422, EK429: 429 };
const UNAVAILABLE = "Fan Zone is not available right now.";

async function targetExists(kind: "match" | "news", id: string) {
  return kind === "match" ? true : (await findStory(id)) !== null; // matches are checked in the database
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = parseTarget(url.searchParams.get("kind"), url.searchParams.get("id"));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = DATA_SOURCE_KIND === "live" ? serviceClient() : null;
  if (!db) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  if (!(await targetExists(target.kind, target.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await db.rpc("service_fan_feed", { p_kind: target.kind, p_id: target.id, p_token: await deviceToken(), p_limit: 50 });
  if (error) return NextResponse.json({ error: publicMessage(error, UNAVAILABLE) }, { status: STATUS[error.code ?? ""] ?? 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const db = DATA_SOURCE_KIND === "live" ? serviceClient() : null;
  if (!db) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });

  let raw: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 2048) return NextResponse.json({ error: "Too long" }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const target = parseTarget(raw?.kind, raw?.id);
  const act = parseAction(raw);
  if (!target || !act) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!(await targetExists(target.kind, target.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Likes and votes work for any browser: create its anonymous device on first use.
  let token = await deviceToken();
  if (!token) {
    const reg = await db.rpc("service_audience_register", { p_rate_key: await callerKey() });
    if (reg.error) return NextResponse.json({ error: publicMessage(reg.error, UNAVAILABLE) }, { status: reg.error.code === "EK429" ? 429 : 503 });
    token = (reg.data as { token: string }).token;
    await setDeviceCookie(token);
  }
  const { data, error } = await db.rpc("service_fan_act", { p_token: token, p_kind: target.kind, p_id: target.id, p_action: act.action, p: act.payload });
  if (error) return NextResponse.json({ error: publicMessage(error, UNAVAILABLE) }, { status: STATUS[error.code ?? ""] ?? 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
