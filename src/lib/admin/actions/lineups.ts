"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LineupEditorState, LineupPayloadEntry, LineupResult } from "@/lib/lineup";
import { describeDbError } from "../errors";
import { assertAdmin } from "../permissions";
import type { ActionState } from "../types";
import { adminAction, check, id, ok, text } from "./util";

/*
 * Line-up actions for the admin editor. Same RPCs the operator console uses
 * (save_lineup / confirm_lineup / reopen_lineup), plus the ADMIN-only
 * correction and kick-off override. Postgres validates everything.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function call(fn: string, args: Record<string, unknown>, matchId: string): Promise<LineupResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID.test(String(args.p_match_id)) || !UUID.test(String(args.p_team_id))) return { ok: false, error: "Invalid match or team." };
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc(fn, args);
    if (error) return { ok: false, error: describeDbError(error) };
    revalidatePath(`/admin/matches/${matchId}`, "layout");
    updateTag(PUBLIC_DATA_TAG);
    return { ok: true, state: data as LineupEditorState };
  } catch (e) {
    console.error("[lineup action]", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

function clean(players: LineupPayloadEntry[]): LineupPayloadEntry[] {
  if (!Array.isArray(players) || players.length > 40) return [];
  return players.map((p) => ({
    player_id: String(p.player_id),
    role: p.role === "STARTER" ? "STARTER" : "SUBSTITUTE",
    slot: typeof p.slot === "number" && Number.isInteger(p.slot) ? p.slot : null,
    captain: p.captain === true,
  }));
}

export async function saveLineup(matchId: string, teamId: string, formation: string | null, players: LineupPayloadEntry[]) {
  return call("save_lineup", { p_match_id: matchId, p_team_id: teamId, p_formation: formation, p_players: clean(players) }, matchId);
}

export async function confirmLineup(matchId: string, teamId: string) {
  return call("confirm_lineup", { p_match_id: matchId, p_team_id: teamId }, matchId);
}

export async function reopenLineup(matchId: string, teamId: string, reason: string) {
  return call("reopen_lineup", { p_match_id: matchId, p_team_id: teamId, p_reason: String(reason).slice(0, 300) }, matchId);
}

export async function correctLineup(matchId: string, teamId: string, formation: string | null, players: LineupPayloadEntry[], reason: string) {
  return call(
    "admin_correct_lineup",
    { p_match_id: matchId, p_team_id: teamId, p_formation: formation, p_players: clean(players), p_reason: String(reason).slice(0, 300) },
    matchId,
  );
}

/** Emergency kick-off without confirmed line-ups (reason required, audited); empty reason clears it. */
export async function setLineupOverride(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const clear = fd.get("clear") === "1";
    const reason = clear ? "" : text(fd, "reason", { label: "Reason", required: true, max: 300 });
    check(await db.rpc("admin_set_lineup_override", { p_match_id: id(fd, "match_id", "Match"), p_reason: reason || null }));
    revalidatePath("/admin", "layout");
    return ok(clear ? "Override removed: confirmed line-ups are required again." : "Override recorded. The operator can start without confirmed line-ups.");
  });
}
