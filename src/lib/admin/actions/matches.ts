"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { redirect } from "next/navigation";
import { fromWatInput } from "../time";
import type { ActionState } from "../types";
import { adminAction, check, id, int, Invalid, ok, oneOf, optionalId, text } from "./util";

/*
 * Everything here goes through admin_* RPCs (SECURITY DEFINER, explicit
 * ADMIN check, row lock, audit). No action ever writes score, clock or
 * sequence columns: scores are always re-derived from events.
 */

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  updateTag(PUBLIC_DATA_TAG); // public pages see admin changes immediately
  return ok(msg);
};

function kickoff(fd: FormData): string {
  const iso = fromWatInput(String(fd.get("scheduled_at") ?? ""));
  if (!iso) throw new Invalid("Enter a valid kick-off date and time (campus time, WAT).");
  return iso;
}

function fixtureArgs(fd: FormData) {
  const home = id(fd, "home_team_id", "Home team");
  const away = id(fd, "away_team_id", "Away team");
  if (home === away) throw new Invalid("Home and away team must be different.");
  const group = optionalId(fd, "group_id");
  const stage = optionalId(fd, "stage_id");
  if (group && !stage) throw new Invalid("Choose the stage the group belongs to.");
  return {
    p_stage_id: stage,
    p_group_id: group,
    p_round_label: text(fd, "round_label", { label: "Matchday / round", max: 60 }),
    p_home_team_id: home,
    p_away_team_id: away,
    p_venue_id: optionalId(fd, "venue_id"),
    p_scheduled_at: kickoff(fd),
  };
}

export async function createFixture(_: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const another = fd.get("another") === "1";
  const res = await adminAction(async ({ db }) => {
    newId = check(await db.rpc("admin_create_match", { p_competition_id: id(fd, "competition_id", "Competition"), ...fixtureArgs(fd) })) as string;
    return done("Fixture created.");
  });
  if (res?.ok && newId && !another) redirect(`/admin/matches/${newId}?created=1`);
  return res;
}

export async function updateFixture(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_update_fixture", { p_match_id: id(fd, "match_id", "Match"), ...fixtureArgs(fd) }));
    return done("Fixture updated.");
  });
}

export async function setMatchOutcome(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const status = oneOf(fd, "status", ["POSTPONED", "CANCELLED", "ABANDONED"] as const, "outcome");
    const reason = text(fd, "reason", { label: "Reason", required: true, max: 300 });
    if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== status) throw new Invalid(`Type ${status} to confirm.`);
    check(await db.rpc("admin_set_match_outcome", { p_match_id: id(fd, "match_id", "Match"), p_status: status, p_reason: reason }));
    return done(`Match marked ${status.toLowerCase()}.`);
  });
}

export async function rescheduleMatch(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_reschedule_match", {
        p_match_id: id(fd, "match_id", "Match"),
        p_scheduled_at: kickoff(fd),
        p_reason: text(fd, "reason", { label: "Note", max: 300 }),
      }),
    );
    return done("Match rescheduled.");
  });
}

export async function assignOperators(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const primary = id(fd, "primary", "Primary operator");
    const backup = optionalId(fd, "backup");
    if (backup === primary) throw new Invalid("Primary and backup must be different people.");
    check(await db.rpc("admin_assign_operators", { p_match_id: id(fd, "match_id", "Match"), p_primary: primary, p_backup: backup }));
    return done(backup ? "Primary and backup assigned." : "Primary operator assigned.");
  });
}

export async function clearAssignments(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_clear_assignments", { p_match_id: id(fd, "match_id", "Match") }));
    return done("Operators removed from this match.");
  });
}

// ── Corrections ──────────────────────────────────────────────────────────────
export async function voidEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_void_event", {
        p_match_id: id(fd, "match_id", "Match"),
        p_event_id: id(fd, "event_id", "Event"),
        p_reason: text(fd, "reason", { label: "Correction reason", required: true, max: 300 }),
      }),
    );
    return done("Event voided. Score re-derived from the remaining events.");
  });
}

export async function addEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    // Client-generated id makes a double submit idempotent (the RPC replays it).
    const eventId = optionalId(fd, "event_id") ?? randomUUID();
    const extra = String(fd.get("minute_extra") ?? "").trim();
    check(
      await db.rpc("admin_add_event", {
        p_match_id: id(fd, "match_id", "Match"),
        p_event_id: eventId,
        p_type: text(fd, "type", { label: "Event type", required: true, max: 40 }),
        p_team_id: id(fd, "team_id", "Team"),
        p_period: int(fd, "period", "Period", 1, 2),
        p_minute: int(fd, "minute", "Minute", 0, 200), // the database checks the range for this match's half length
        p_minute_extra: extra ? int(fd, "minute_extra", "Added time", 0, 60) : 0,
        p_player_id: optionalId(fd, "player_id"),
        p_related_player_id: optionalId(fd, "related_player_id"),
        p_reason: text(fd, "reason", { label: "Correction reason", required: true, max: 300 }),
      }),
    );
    return done("Event added. Score re-derived.");
  });
}
