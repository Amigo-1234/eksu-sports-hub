import { NextResponse } from "next/server";
import type { OpEvent, OpEventType, OpLogEntry, OpMatchState } from "@/lib/operator/types";
import { initialClock } from "@/lib/operator/clock";
import { markPractice, PRACTICE_HALF_SECONDS } from "@/lib/practice/script";
import { PRACTICE_MATCH_ID } from "@/lib/practice/seed";
import { publicMessage, serviceClient } from "@/lib/registration/server";

/*
 * POST /api/practice/submit { token, name, state: { phase, events, log } }
 * Re-marks the attempt on the server from the recorded events (the browser's
 * own score is never trusted) and stores it once against the practice link.
 */

export const dynamic = "force-dynamic";

const TYPES = new Set<OpEventType>(["GOAL", "PENALTY_GOAL", "OWN_GOAL", "YELLOW_CARD", "SECOND_YELLOW", "RED_CARD", "SUBSTITUTION", "PENALTY_MISS", "PENALTY_AWARDED", "PENALTY_SAVED", "INJURY", "SUSPENSION_RETURN", "EXCLUSION"]);
const KINDS = new Set(["MATCH_STARTED", "PERIOD_ENDED", "PERIOD_STARTED", "MATCH_FINALISED", "PAUSED", "RESUMED", "STOPPAGE_SET", "EVENT_VOIDED", "OPERATOR_TAKEOVER"]);
const PHASES = new Set(["SCHEDULED", "FIRST_HALF", "HALF_TIME", "SECOND_HALF", "FULL_TIME", "ABANDONED"]);
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

function clean(raw: unknown): OpMatchState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.phase !== "string" || !PHASES.has(r.phase) || !Array.isArray(r.events) || !Array.isArray(r.log)) return null;
  if (r.events.length > 80 || r.log.length > 120) return null;
  const events: OpEvent[] = [];
  for (const x of r.events as Record<string, unknown>[]) {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || !TYPES.has(x.type as OpEventType)) return null;
    if (x.side !== "home" && x.side !== "away") return null;
    const minute = int(x.minute, 0, 200);
    if (minute === null) return null;
    events.push({
      id: x.id.slice(0, 80),
      matchId: PRACTICE_MATCH_ID,
      type: x.type as OpEventType,
      side: x.side,
      minute,
      addedTime: int(x.addedTime, 0, 60) ?? 0,
      shirt: int(x.shirt, 1, 99),
      shirtIn: int(x.shirtIn, 1, 99),
      recordedAt: typeof x.recordedAt === "number" ? x.recordedAt : 0,
      voided: x.voided && typeof x.voided === "object" ? { at: Number((x.voided as { at?: unknown }).at) || 0, reason: "voided" } : null,
      intentId: null,
    });
  }
  const log: OpLogEntry[] = [];
  for (const l of r.log as Record<string, unknown>[]) {
    if (!l || typeof l !== "object" || !KINDS.has(String(l.kind)) || typeof l.at !== "number") continue;
    log.push({ id: String(l.id ?? "").slice(0, 80), at: l.at, kind: l.kind as OpLogEntry["kind"], detail: typeof l.detail === "string" ? l.detail.slice(0, 40) : undefined });
  }
  return {
    matchId: PRACTICE_MATCH_ID,
    phase: r.phase as OpMatchState["phase"],
    clock: initialClock({ halfSeconds: PRACTICE_HALF_SECONDS, etHalfSeconds: 0 }),
    events,
    log,
    version: 0,
  };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "Practice is not available right now." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 60_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const token = typeof body.token === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(body.token) ? body.token : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const state = clean(body.state);
  if (!token || !name || !state) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (state.phase !== "FULL_TIME") return NextResponse.json({ error: "Finish the match (full-time) before submitting." }, { status: 409 });

  const mark = markPractice(state);
  const result = {
    items: mark.items,
    finalScore: mark.finalScore,
    strayEvents: mark.strayEvents,
    avgDelaySeconds: mark.avgDelaySeconds,
    events: state.events.map((e) => ({ type: e.type, side: e.side, minute: e.minute, shirt: e.shirt, shirtIn: e.shirtIn ?? null, voided: !!e.voided })),
  };
  const { data, error } = await db.rpc("service_practice_submit", { p_token: token, p_name: name, p_score: mark.score, p_result: result });
  if (error) {
    const status = error.code === "EK404" ? 404 : error.code === "EK409" ? 409 : error.code === "EK422" ? 422 : 503;
    return NextResponse.json({ error: publicMessage(error, "Could not submit. Try again.") }, { status });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
