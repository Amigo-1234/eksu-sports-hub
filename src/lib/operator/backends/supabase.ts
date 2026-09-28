"use client";

/**
 * supabaseOperatorBackend — delivers intents to the authenticated Postgres
 * RPCs and returns the canonical state for reconciliation. This is the only
 * module (with the server data layer) that knows RPC names and arguments.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { fromCanonical, type CanonicalState } from "../canonical";
import type { Intent } from "../queue";
import { operatorStore } from "../store";
import type { Side } from "../types";
import type { DeliverResult, OperatorBackend } from "./types";

function teamId(matchId: string, side: Side): string {
  const t = operatorStore.get().teams[matchId];
  if (!t) throw new Error("Match teams not loaded");
  return side === "home" ? t.home : t.away;
}

function playerId(matchId: string, side: Side, shirt: number | null | undefined): string | null {
  if (shirt == null) return null;
  const squad = operatorStore.get().squads[matchId]?.[side] ?? [];
  const p = squad.find((s) => s.shirt === shirt);
  if (!p) throw new Error(`No. ${shirt} is not in the squad`);
  return p.playerId;
}

/** Map a queued intent onto its RPC call. */
function toRpc(intent: Intent): { fn: string; args: Record<string, unknown> } {
  const base = { p_match_id: intent.matchId, p_intent_id: intent.id };
  const a = intent.args;
  switch (a.command) {
    case "START_MATCH":
      return { fn: "start_match", args: base };
    case "END_PERIOD":
      return { fn: "end_period", args: base };
    case "START_PERIOD":
      return { fn: "start_period", args: base };
    case "RESUME":
      return { fn: "resume_match", args: base };
    case "PAUSE":
      return { fn: "pause_match", args: { ...base, p_reason: a.reason } };
    case "SET_STOPPAGE":
      return { fn: "set_stoppage", args: { ...base, p_minutes: a.minutes } };
    case "VOID_EVENT":
      return { fn: "void_event", args: { ...base, p_event_id: a.eventId, p_reason: a.reason } };
    case "FINALISE_MATCH":
      return {
        fn: "finalise_match",
        args: { ...base, p_confirmed_home: a.confirmedScore.home, p_confirmed_away: a.confirmedScore.away },
      };
    case "RECORD_EVENT": {
      const e = a.event;
      return {
        fn: "record_event",
        args: {
          p_match_id: intent.matchId,
          p_event_id: e.id ?? intent.id,
          p_type: e.type,
          p_team_id: teamId(intent.matchId, e.side),
          p_minute: e.minute,
          p_minute_extra: e.addedTime ?? 0,
          p_player_id: playerId(intent.matchId, e.side, e.shirt),
          p_related_player_id: e.type === "SUBSTITUTION" ? playerId(intent.matchId, e.side, e.shirtIn) : null,
          p_client_ts: new Date(intent.clientTimestamp).toISOString(),
          p_client_queued: !!intent.queuedOffline || intent.attempts > 1,
        },
      };
    }
  }
}

function classify(error: PostgrestError | { message: string; code?: string }): DeliverResult {
  const code = error.code ?? "";
  if (code === "EK401" || code === "PGRST301" || code === "PGRST303") {
    return { ok: false, retryable: false, error: "Your session has expired — sign in again." };
  }
  // Rejected by the database (business rule, permission, validation).
  if (/^(EK\d{3}|[0-9A-Z]{5}|PGRST\d+)$/.test(code)) {
    return { ok: false, retryable: false, error: error.message };
  }
  // Anything else is transport-level (offline, timeout, 5xx): safe to retry,
  // because every RPC is idempotent on its intent/event id.
  return { ok: false, retryable: true, error: error.message || "Network error" };
}

async function call(fn: string, args: Record<string, unknown>): Promise<DeliverResult> {
  try {
    const { data, error } = await supabaseBrowser().rpc(fn, args);
    if (error) return classify(error);
    const c = data as CanonicalState;
    const { data: auth } = await supabaseBrowser().auth.getSession();
    const me = auth.session?.user.id;
    const inControl = me && "active_operator_id" in c.match ? c.match.active_operator_id === me : undefined;
    return { ok: true, canonical: fromCanonical(c), inControl };
  } catch (e) {
    return { ok: false, retryable: true, error: e instanceof Error ? e.message : "Network error" };
  }
}

export const supabaseOperatorBackend: OperatorBackend = {
  kind: "supabase",

  async deliver(intent) {
    let rpc;
    try {
      rpc = toRpc(intent);
    } catch (e) {
      return { ok: false, retryable: false, error: e instanceof Error ? e.message : "Invalid action" };
    }
    return call(rpc.fn, rpc.args);
  },

  async fetchState(matchId) {
    const { data, error } = await supabaseBrowser().rpc("operator_match_state", { p_match_id: matchId });
    if (error || !data) return null;
    const c = data as CanonicalState;
    return { state: fromCanonical(c), inControl: !!c.in_control };
  },

  async savePrep(matchId, prep) {
    const { error } = await supabaseBrowser().rpc("update_assignment_prep", { p_match_id: matchId, p_checks: prep });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async takeOver(matchId, intentId) {
    return call("take_over_match", { p_match_id: matchId, p_intent_id: intentId });
  },

  async measureServerOffset() {
    const t0 = Date.now();
    const { data, error } = await supabaseBrowser().rpc("server_time");
    const t1 = Date.now();
    if (error || !data) return null;
    return Date.parse(data as string) - (t0 + t1) / 2;
  },

  async signOut() {
    await supabaseBrowser().auth.signOut();
  },
};
