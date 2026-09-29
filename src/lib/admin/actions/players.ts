"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import type { ActionState } from "../types";
import { adminAction, bool, check, date, id, int, Invalid, ok, oneOf, optionalId, text } from "./util";

/*
 * Player register, screening decisions and squad membership. Every write is
 * an admin_* RPC: ADMIN re-checked in Postgres, eligibility enforced there,
 * every decision audited. Nothing here writes tables directly.
 */

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  // A decision can reopen a published line-up: public pages must refresh.
  updateTag(PUBLIC_DATA_TAG);
  return ok(msg);
};

const DECISIONS = ["PENDING", "CLEARED", "REJECTED", "SUSPENDED"] as const;
const POSITIONS = ["GK", "DF", "MF", "FW"] as const;

function studentId(fd: FormData): string {
  const v = text(fd, "student_id", { label: "Student / matric number", required: true, max: 40 });
  if (v.replace(/\s+/g, "").length < 3) throw new Invalid("Student / matric number must be at least 3 characters.");
  return v;
}

export async function registerPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  let playerId: string | null = null;
  const another = fd.get("another") === "1";
  const res = await adminAction(async ({ db }) => {
    const r = check(
      await db.rpc("admin_register_player", {
        p_display_name: text(fd, "display_name", { label: "Player name", required: true, max: 80 }),
        p_student_id: studentId(fd),
        p_faculty_id: optionalId(fd, "faculty_id"),
        p_department_id: optionalId(fd, "department_id"),
        p_team_id: id(fd, "team_id", "Team"),
        p_season_id: id(fd, "season_id", "Season"),
        p_competition_id: optionalId(fd, "competition_id"),
        p_notes: text(fd, "notes", { label: "Notes", max: 500 }),
      }),
    ) as { player_id: string };
    playerId = r.player_id;
    return done("Player registered. Screening is pending.");
  });
  if (res?.ok && playerId && !another) redirect(`/admin/players/${playerId}?registered=1`);
  return res;
}

export async function updatePlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_update_player", {
        p_player_id: id(fd, "player_id", "Player"),
        p_display_name: text(fd, "display_name", { label: "Player name", required: true, max: 80 }),
        p_student_id: studentId(fd),
        p_faculty_id: optionalId(fd, "faculty_id"),
        p_department_id: optionalId(fd, "department_id"),
      }),
    );
    return done("Player details saved.");
  });
}

export async function openScreening(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_open_screening", {
        p_player_id: id(fd, "player_id", "Player"),
        p_team_id: id(fd, "team_id", "Team"),
        p_season_id: id(fd, "season_id", "Season"),
        p_competition_id: optionalId(fd, "competition_id"),
        p_notes: text(fd, "notes", { label: "Notes", max: 500 }),
      }),
    );
    return done("Screening opened (pending).");
  });
}

export async function decideScreening(_: ActionState, fd: FormData): Promise<ActionState> {
  // From the queue the decided row leaves the list, so the result is shown on the page instead.
  const returnTo = String(fd.get("return_to") ?? "");
  let notice: string | null = null;
  const res = await adminAction(async ({ db }) => {
    const status = oneOf(fd, "status", DECISIONS, "decision");
    const reason = text(fd, "reason", { label: "Reason", max: 300 });
    if ((status === "REJECTED" || status === "SUSPENDED") && !reason) throw new Invalid("A reason is required.");
    const screenedOn = String(fd.get("screened_on") ?? "").trim() ? date(fd, "screened_on", "Screening date") : null;
    const r = check(
      await db.rpc("admin_decide_screening", {
        p_screening_id: id(fd, "screening_id", "Screening"),
        p_status: status,
        p_reason: reason || null,
        p_notes: text(fd, "notes", { label: "Notes", max: 500 }) || null,
        p_screened_on: screenedOn,
      }),
    ) as { reopened_lineups: number };
    const verb = { PENDING: "returned to pending", CLEARED: "cleared", REJECTED: "rejected", SUSPENDED: "suspended" }[status];
    const extra = r.reopened_lineups > 0 ? ` ${r.reopened_lineups} confirmed line-up${r.reopened_lineups > 1 ? "s were" : " was"} reopened.` : "";
    const who = text(fd, "player_name", { label: "Player", max: 120 });
    notice = `${who || "Player"} ${verb}.${extra}`;
    return done(`Player ${verb}.${extra}`);
  });
  if (res?.ok && notice && /^\/admin\/(screening|players\/[0-9a-f-]{36})(\?|$)/.test(returnTo)) {
    const url = new URL(returnTo, "http://local");
    url.searchParams.set("notice", notice);
    redirect(`${url.pathname}${url.search}`);
  }
  return res;
}

export async function addSquadPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_add_squad_player", {
        p_squad_id: id(fd, "squad_id", "Squad"),
        p_player_id: id(fd, "player_id", "Player"),
        p_shirt_number: int(fd, "shirt_number", "Shirt number", 1, 99),
        p_position: String(fd.get("position") ?? "") ? oneOf(fd, "position", POSITIONS, "position") : null,
        p_is_captain: bool(fd, "is_captain"),
      }),
    );
    return done("Player added to the squad.");
  });
}

export async function updateSquadPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_update_squad_player", {
        p_squad_player_id: id(fd, "id", "Squad member"),
        p_shirt_number: int(fd, "shirt_number", "Shirt number", 1, 99),
        p_position: String(fd.get("position") ?? "") ? oneOf(fd, "position", POSITIONS, "position") : null,
        p_is_captain: bool(fd, "is_captain"),
      }),
    );
    return done("Squad member updated.");
  });
}

export async function setSquadPlayerActive(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const active = fd.get("active") === "1";
    check(
      await db.rpc("admin_set_squad_player_active", {
        p_squad_player_id: id(fd, "id", "Squad member"),
        p_active: active,
        p_reason: text(fd, "reason", { label: "Reason", max: 300 }) || null,
      }),
    );
    return done(active ? "Membership reactivated." : "Player removed from the active squad (history kept).");
  });
}
