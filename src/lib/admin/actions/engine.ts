"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeDbError } from "../errors";
import { assertAdmin } from "../permissions";
import { fromWatInput } from "../time";
import { STAGE_TYPES, type ActionState } from "../types";
import { adminAction, bool, check, id, int, Invalid, ok, oneOf, optionalId, text } from "./util";

/*
 * Competition Engine V2 admin actions. Every write is an ADMIN-only Postgres
 * RPC that validates, locks and audits; these actions only parse input.
 * Locked changes need an explicit override reason (audited as LOCK_OVERRIDE).
 */

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  updateTag(PUBLIC_DATA_TAG);
  return ok(msg);
};

const reason = (fd: FormData, label = "Reason", required = true) => text(fd, "reason", { label, required, max: 300 });
const override = (fd: FormData) => text(fd, "override_reason", { label: "Override reason", max: 300 }) || null;

// ── Stages ──────────────────────────────────────────────────────────────────
function qualificationFrom(fd: FormData) {
  const perGroup = String(fd.get("per_group") ?? "").trim();
  const top = String(fd.get("top") ?? "").trim();
  const bestRank = String(fd.get("best_rank") ?? "").trim();
  const bestCount = String(fd.get("best_count") ?? "").trim();
  const q: Record<string, unknown> = {};
  if (perGroup) q.per_group = int(fd, "per_group", "Qualifiers per group", 1, 16);
  if (top) q.top = int(fd, "top", "Top teams qualifying", 1, 64);
  if (bestRank && bestCount) q.best_ranked = { rank: int(fd, "best_rank", "Best-ranked position", 2, 8), count: int(fd, "best_count", "Best-ranked count", 1, 16) };
  return q;
}

const triState = (fd: FormData, key: string): boolean | null => {
  const v = String(fd.get(key) ?? "");
  return v === "yes" ? true : v === "no" ? false : null;
};

export async function createStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const stageType = oneOf(fd, "stage_type", STAGE_TYPES, "stage type");
    check(
      await db.rpc("admin_create_stage", {
        p_competition_id: id(fd, "competition_id", "Competition"),
        p_name: text(fd, "name", { label: "Stage name", required: true, max: 60 }),
        p_stage_type: stageType,
        p_stage_order: int(fd, "stage_order", "Order", 1, 20),
        p_settings: {
          legs: stageType === "LEAGUE" || stageType === "GROUP" ? int(fd, "legs", "Legs", 1, 2) : 1,
          extra_time_allowed: triState(fd, "extra_time"),
          penalties_allowed: triState(fd, "penalties"),
          qualification: qualificationFrom(fd),
        },
      }),
    );
    return done("Stage added.");
  });
}

export async function updateStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const stageType = oneOf(fd, "stage_type", STAGE_TYPES, "stage type");
    const table = stageType === "LEAGUE" || stageType === "GROUP";
    check(
      await db.rpc("admin_update_stage", {
        p_stage_id: id(fd, "stage_id", "Stage"),
        p_settings: {
          name: text(fd, "name", { label: "Stage name", required: true, max: 60 }),
          stage_order: int(fd, "stage_order", "Order", 1, 20),
          stage_type: stageType,
          has_table: table,
          legs: table ? int(fd, "legs", "Legs", 1, 2) : 1,
          extra_time_allowed: triState(fd, "extra_time"),
          penalties_allowed: triState(fd, "penalties"),
          qualification: table ? qualificationFrom(fd) : {},
        },
        p_override_reason: override(fd),
      }),
    );
    return done("Stage saved.");
  });
}

// ── Groups ──────────────────────────────────────────────────────────────────
export async function createGroupsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const count = String(fd.get("count") ?? "").trim();
    const names = count
      ? Array.from({ length: int(fd, "count", "Number of groups", 1, 16) }, (_, i) => `Group ${String.fromCharCode(65 + i)}`)
      : text(fd, "names", { label: "Group names", required: true, max: 400 }).split(",").map((s) => s.trim()).filter(Boolean);
    const n = check(await db.rpc("admin_create_groups", { p_stage_id: id(fd, "stage_id", "Stage"), p_names: names })) as number;
    return done(`${n} group${n === 1 ? "" : "s"} created.`);
  });
}

export async function assignGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_assign_team_group", {
        p_competition_id: id(fd, "competition_id", "Competition"),
        p_team_id: id(fd, "team_id", "Team"),
        p_group_id: optionalId(fd, "group_id"),
        p_override_reason: override(fd),
      }),
    );
    return done("Group draw updated.");
  });
}

// ── Fixture generator (preview → confirm) ───────────────────────────────────
export interface FixturePreview {
  stage_id: string;
  legs: number;
  match_count: number;
  matchdays: number;
  existing_fixtures: number;
  issues: string[];
  hash: string;
  fixtures: {
    matchday: number;
    slot: number;
    group_id: string | null;
    group_name: string | null;
    home_team_id: string;
    away_team_id: string;
    home: string;
    away: string;
    home_code: string;
    away_code: string;
    round_label: string;
    scheduled_at: string;
    venue_id: string | null;
  }[];
}
export type FixtureConfig = { start_date: string; kickoff_time: string; days_between: number; spacing_minutes: number; legs: number; venue_id: string | null };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function adminRpc<T>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
  const auth = await assertAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc(fn, args);
    if (error) return { ok: false, error: describeDbError(error) };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

function cleanConfig(c: FixtureConfig): FixtureConfig {
  return {
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(c.start_date) ? c.start_date : "",
    kickoff_time: /^\d{2}:\d{2}$/.test(c.kickoff_time) ? c.kickoff_time : "16:00",
    days_between: Math.max(1, Math.min(60, Math.round(Number(c.days_between) || 7))),
    spacing_minutes: Math.max(0, Math.min(720, Math.round(Number(c.spacing_minutes) || 0))),
    legs: Number(c.legs) === 2 ? 2 : 1,
    venue_id: c.venue_id && /^[0-9a-f-]{36}$/i.test(c.venue_id) ? c.venue_id : null,
  };
}

export async function previewFixturesAction(stageId: string, config: FixtureConfig): Promise<Result<FixturePreview>> {
  return adminRpc("admin_preview_fixtures", { p_stage_id: stageId, p_config: cleanConfig(config) });
}

export async function confirmFixturesAction(stageId: string, config: FixtureConfig, hash: string): Promise<Result<{ created: number; idempotent: boolean }>> {
  const r = await adminRpc<{ created: number; idempotent: boolean }>("admin_confirm_fixtures", { p_stage_id: stageId, p_config: cleanConfig(config), p_preview_hash: hash });
  if (r.ok) {
    revalidatePath("/admin", "layout");
    updateTag(PUBLIC_DATA_TAG);
  }
  return r;
}

export async function clearFixturesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const r = check(await db.rpc("admin_clear_generated_fixtures", { p_stage_id: id(fd, "stage_id", "Stage"), p_reason: reason(fd) })) as { cleared: number };
    return done(`${r.cleared} untouched fixtures removed. You can generate again.`);
  });
}

export async function scheduleFixtureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const kickoff = fromWatInput(String(fd.get("scheduled_at") ?? ""));
    if (!kickoff) throw new Invalid("Kick-off date and time are required.");
    const md = String(fd.get("matchday") ?? "").trim();
    check(
      await db.rpc("admin_schedule_fixture", {
        p_match_id: id(fd, "match_id", "Fixture"),
        p_scheduled_at: kickoff,
        p_venue_id: optionalId(fd, "venue_id"),
        p_matchday: md ? int(fd, "matchday", "Matchday", 1, 200) : null,
        p_reason: reason(fd, "Reason", false) || null,
      }),
    );
    return done("Fixture scheduled. The change is kept in the fixture history.");
  });
}

// ── Knockout ────────────────────────────────────────────────────────────────
export interface KnockoutPreview {
  first_stage_id: string;
  source_stage_id: string | null;
  qualifiers: number;
  pairing: "CROSS_GROUPS" | "SEEDED";
  third_place: boolean;
  existing_ties: number;
  hash: string;
  stages: { stage_id: string; name: string; stage_type: string; third_place?: boolean; ties: { position: number; code: string; home: { label: string }; away: { label: string } }[] }[];
}
export type KnockoutConfig = { pairing: "CROSS_GROUPS" | "SEEDED"; avoid_same_group: boolean; third_place: boolean };

const cleanKo = (c: KnockoutConfig): KnockoutConfig => ({
  pairing: c.pairing === "CROSS_GROUPS" ? "CROSS_GROUPS" : "SEEDED",
  avoid_same_group: Boolean(c.avoid_same_group),
  third_place: Boolean(c.third_place),
});

export async function previewKnockoutAction(stageId: string, config: KnockoutConfig): Promise<Result<KnockoutPreview>> {
  return adminRpc("admin_preview_knockout", { p_stage_id: stageId, p_config: cleanKo(config) });
}

export async function confirmKnockoutAction(stageId: string, config: KnockoutConfig, hash: string): Promise<Result<{ created: number; idempotent: boolean }>> {
  const r = await adminRpc<{ created: number; idempotent: boolean }>("admin_confirm_knockout", { p_stage_id: stageId, p_config: cleanKo(config), p_preview_hash: hash });
  if (r.ok) {
    revalidatePath("/admin", "layout");
    updateTag(PUBLIC_DATA_TAG);
  }
  return r;
}

export async function scheduleTieAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const kickoff = fromWatInput(String(fd.get("scheduled_at") ?? ""));
    if (!kickoff) throw new Invalid("Kick-off date and time are required.");
    check(
      await db.rpc("admin_schedule_tie", {
        p_tie_id: id(fd, "tie_id", "Tie"),
        p_scheduled_at: kickoff,
        p_venue_id: optionalId(fd, "venue_id"),
        p_reason: reason(fd, "Reason", false) || null,
      }),
    );
    return done("Tie scheduled. Its match is created once both teams are known.");
  });
}

export async function decideTieAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_decide_tie", { p_tie_id: id(fd, "tie_id", "Tie"), p_winner_team_id: id(fd, "winner_team_id", "Winner"), p_reason: reason(fd) }));
    return done("Tie decided. The winner advances.");
  });
}

export async function reconcileTieAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_reconcile_tie", { p_tie_id: id(fd, "tie_id", "Tie"), p_reason: reason(fd) }));
    return done("Bracket reconciled with the corrected result.");
  });
}

export async function resolveTieSideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_resolve_tie_side", {
        p_tie_id: id(fd, "tie_id", "Tie"),
        p_side: oneOf(fd, "side", ["HOME", "AWAY"] as const, "side"),
        p_team_id: id(fd, "team_id", "Team"),
        p_reason: reason(fd),
      }),
    );
    return done("Team placed in the bracket.");
  });
}

export async function qualificationDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const raw = String(fd.get("decision") ?? "");
    check(
      await db.rpc("admin_set_qualification_decision", {
        p_stage_id: id(fd, "stage_id", "Stage"),
        p_team_id: id(fd, "team_id", "Team"),
        p_decision: raw === "QUALIFIED" || raw === "ELIMINATED" ? raw : null,
        p_reason: reason(fd),
      }),
    );
    return done(raw ? "Qualification decision recorded." : "Decision withdrawn.");
  });
}

// ── Discipline ──────────────────────────────────────────────────────────────
export async function disciplineRulesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const threshold = String(fd.get("yellow_threshold") ?? "").trim();
    check(
      await db.rpc("admin_set_discipline_rules", {
        p_competition_id: id(fd, "competition_id", "Competition"),
        p_enabled: bool(fd, "enabled"),
        p_red_card_matches: int(fd, "red_card_matches", "Straight red ban", 0, 10),
        p_second_yellow_matches: int(fd, "second_yellow_matches", "Second-yellow ban", 0, 10),
        p_yellow_threshold: threshold ? int(fd, "yellow_threshold", "Yellow-card threshold", 2, 10) : null,
        p_yellow_suspension_matches: int(fd, "yellow_suspension_matches", "Yellow accumulation ban", 1, 10),
      }),
    );
    return done("Discipline rules saved. Suspensions were recalculated.");
  });
}

export async function addSuspensionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const [team, player] = String(fd.get("player") ?? "").split(":");
    const f = new FormData();
    f.set("t", team ?? "");
    f.set("p", player ?? "");
    check(
      await db.rpc("admin_add_suspension", {
        p_competition_id: id(fd, "competition_id", "Competition"),
        p_player_id: id(f, "p", "Player"),
        p_team_id: id(f, "t", "Team"),
        p_matches: int(fd, "matches", "Matches", 1, 20),
        p_reason: reason(fd),
      }),
    );
    return done("Suspension added.");
  });
}

export async function cancelSuspensionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_cancel_suspension", { p_suspension_id: id(fd, "suspension_id", "Suspension"), p_reason: reason(fd) }));
    return done("Suspension cancelled (the record is kept).");
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
export async function completeStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_complete_stage", { p_stage_id: id(fd, "stage_id", "Stage") }));
    return done("Stage completed.");
  });
}

export async function completeCompetitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_complete_competition", { p_competition_id: id(fd, "competition_id", "Competition") }));
    return done("Competition completed. Honours are derived from the results.");
  });
}

export async function reopenCompetitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_reopen_competition", { p_competition_id: id(fd, "competition_id", "Competition"), p_reason: reason(fd) }));
    return done("Competition reopened.");
  });
}

export async function recomputeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_recompute_standings", { p_competition_id: id(fd, "competition_id", "Competition") }));
    return done("Standings, qualification, advancement and discipline recomputed from results.");
  });
}

export async function competitionRulesOverrideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const tiebreakers = fd.getAll("tiebreakers").map(String).filter(Boolean);
    check(
      await db.rpc("admin_update_competition_rules", {
        p_competition_id: id(fd, "competition_id", "Competition"),
        p_settings: {
          points_win: int(fd, "points_win", "Points for a win", 0, 10),
          points_draw: int(fd, "points_draw", "Points for a draw", 0, 10),
          points_loss: int(fd, "points_loss", "Points for a loss", 0, 10),
          tiebreakers: [...new Set(tiebreakers)],
        },
        p_override_reason: override(fd) ?? (() => { throw new Invalid("An override reason is required."); })(),
      }),
    );
    return done("Rules changed with an audited override. Tables were recomputed.");
  });
}

/** "7:30", "7.5" or "45" (minutes) → seconds, in steps of 30 seconds. */
function clockLength(fd: FormData, key: string, label: string, maxSeconds: number): number {
  const raw = String(fd.get(key) ?? "").trim();
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
  const seconds = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d{1,2}(\.\d+)?$/.test(raw) ? Math.round(Number(raw) * 60) : NaN;
  if (!Number.isFinite(seconds)) throw new Invalid(`${label}: enter minutes like 7:30 or 7.5.`);
  if (seconds < 60 || seconds > maxSeconds) throw new Invalid(`${label} must be between 1:00 and ${maxSeconds / 60}:00.`);
  if (seconds % 30 !== 0) throw new Invalid(`${label} must be in steps of 30 seconds (e.g. 7:00, 7:30).`);
  return seconds;
}

export async function matchDurationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_set_match_duration", {
        p_competition_id: id(fd, "competition_id", "Competition"),
        p_half_seconds: clockLength(fd, "half", "Half length", 3600),
        p_et_half_seconds: clockLength(fd, "et_half", "Extra-time half", 1800),
        p_override_reason: text(fd, "reason", { label: "Reason", max: 300 }) || null,
      }),
    );
    return done("Match length saved.");
  });
}
