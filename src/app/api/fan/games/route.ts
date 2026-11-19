import { NextResponse } from "next/server";
import { DATA_SOURCE_KIND } from "@/lib/data";
import { parseGamesAction, parseTarget } from "@/lib/fan/types";
import { deviceToken, setDeviceCookie } from "@/lib/notifications/server";
import { callerKey, publicMessage, serviceClient } from "@/lib/registration/server";

/*
 * /api/fan/games — score predictions and Player of the Match for one match.
 * GET ?id=<match>  → state from this browser's point of view.
 * POST { id, action: "predict", home, away } | { id, action: "unpredict" } | { id, action: "potm", player_id }
 */

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { EK401: 401, EK403: 403, EK404: 404, EK409: 409, EK422: 422, EK429: 429 };
const UNAVAILABLE = "Fan games are not available right now.";

export async function GET(request: Request) {
  const target = parseTarget("match", new URL(request.url).searchParams.get("id"));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = DATA_SOURCE_KIND === "live" ? serviceClient() : null;
  if (!db) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  const { data, error } = await db.rpc("service_fan_games", { p_match_id: target.id, p_token: await deviceToken() });
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
    if (text.length > 1024) return NextResponse.json({ error: "Too long" }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const target = parseTarget("match", raw?.id);
  const act = parseGamesAction(raw);
  if (!target || !act) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let token = await deviceToken();
  if (!token) {
    const reg = await db.rpc("service_audience_register", { p_rate_key: await callerKey() });
    if (reg.error) return NextResponse.json({ error: publicMessage(reg.error, UNAVAILABLE) }, { status: reg.error.code === "EK429" ? 429 : 503 });
    token = (reg.data as { token: string }).token;
    await setDeviceCookie(token);
  }
  const { data, error } = await db.rpc("service_fan_games_act", { p_token: token, p_match_id: target.id, p_action: act.action, p: act.payload });
  if (error) return NextResponse.json({ error: publicMessage(error, UNAVAILABLE) }, { status: STATUS[error.code ?? ""] ?? 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
