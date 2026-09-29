"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "../types";
import { adminAction, bool, check, id, int, Invalid, ok, oneOf, optionalId, slugify, text } from "./util";

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  return ok(msg);
};

const KINDS = ["FACULTY", "DEPARTMENT", "OTHER"] as const;
const CATEGORIES = ["MEN", "WOMEN", "MIXED"] as const;
const POSITIONS = ["GK", "DF", "MF", "FW"] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

function teamFields(fd: FormData) {
  const name = text(fd, "name", { label: "Team name", required: true, max: 80 });
  const code = text(fd, "code", { label: "Code", required: true, max: 4 }).toUpperCase();
  if (code.length < 2) throw new Invalid("Code must be 2–4 characters.");
  const slug = slugify(text(fd, "slug", { label: "Slug", max: 60 }) || name);
  if (!slug) throw new Invalid("Slug must contain letters or numbers.");
  const color_primary = text(fd, "color_primary", { label: "Primary colour", required: true, max: 7 });
  const color_secondary = text(fd, "color_secondary", { label: "Secondary colour", required: true, max: 7 });
  if (!HEX.test(color_primary) || !HEX.test(color_secondary)) throw new Invalid("Colours must be hex values like #761530.");
  return {
    name,
    short_name: text(fd, "short_name", { label: "Short name", required: true, max: 30 }),
    code,
    slug,
    kind: oneOf(fd, "kind", KINDS, "team type"),
    category: oneOf(fd, "category", CATEGORIES, "category"),
    sport_id: id(fd, "sport_id", "Sport"),
    faculty_id: optionalId(fd, "faculty_id"),
    department_id: optionalId(fd, "department_id"),
    color_primary,
    color_secondary,
  };
}

export async function createTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await adminAction(async ({ db }) => {
    const row = check(await db.from("teams").insert(teamFields(fd)).select("id").single()) as { id: string };
    newId = row.id;
    return done("Team created.");
  });
  if (res?.ok && newId) redirect(`/admin/teams/${newId}?created=1`);
  return res;
}

export async function updateTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("teams").update(teamFields(fd)).eq("id", id(fd, "id", "Team")));
    return done("Team saved.");
  });
}

export async function setTeamActive(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const active = fd.get("active") === "1";
    check(await db.from("teams").update({ active }).eq("id", id(fd, "id", "Team")));
    return done(active ? "Team reactivated." : "Team deactivated.");
  });
}

// ── Squads ───────────────────────────────────────────────────────────────────
export async function createSquad(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("squads").insert({ team_id: id(fd, "team_id", "Team"), season_id: id(fd, "season_id", "Season") }));
    return done("Squad created.");
  });
}

async function clearCaptain(db: Parameters<Parameters<typeof adminAction>[0]>[0]["db"], squadId: string, except?: string) {
  let q = db.from("squad_players").update({ is_captain: false }).eq("squad_id", squadId).eq("is_captain", true);
  if (except) q = q.neq("id", except);
  check(await q);
}

export async function addSquadPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const squad_id = id(fd, "squad_id", "Squad");
    const shirt_number = int(fd, "shirt_number", "Shirt number", 1, 99);
    const display_name = text(fd, "display_name", { label: "Player name", max: 80 }) || null;
    const position = String(fd.get("position") ?? "") ? oneOf(fd, "position", POSITIONS, "position") : null;
    const is_captain = bool(fd, "is_captain");
    // Check the shirt first so we never leave an orphan player behind.
    const taken = check(await db.from("squad_players").select("id").eq("squad_id", squad_id).eq("shirt_number", shirt_number)) as unknown[];
    if (taken.length) throw new Invalid(`Shirt ${shirt_number} is already taken in this squad.`);
    const player = check(await db.from("players").insert({ display_name }).select("id").single()) as { id: string };
    if (is_captain) await clearCaptain(db, squad_id);
    const res = await db.from("squad_players").insert({ squad_id, player_id: player.id, shirt_number, position, is_captain });
    if (res.error) {
      await db.from("players").delete().eq("id", player.id);
      check(res);
    }
    return done(`Player #${shirt_number} added.`);
  });
}

export async function updateSquadPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const rowId = id(fd, "id", "Squad player");
    const squad_id = id(fd, "squad_id", "Squad");
    const player_id = id(fd, "player_id", "Player");
    const is_captain = bool(fd, "is_captain");
    const position = String(fd.get("position") ?? "") ? oneOf(fd, "position", POSITIONS, "position") : null;
    if (is_captain) await clearCaptain(db, squad_id, rowId);
    check(
      await db
        .from("squad_players")
        .update({ shirt_number: int(fd, "shirt_number", "Shirt number", 1, 99), position, is_captain })
        .eq("id", rowId),
    );
    check(await db.from("players").update({ display_name: text(fd, "display_name", { label: "Player name", max: 80 }) || null }).eq("id", player_id));
    return done("Player updated.");
  });
}

export async function removeSquadPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("squad_players").delete().eq("id", id(fd, "id", "Squad player")));
    // Remove the player record too when they are in no other squad (else it stays).
    await db.from("players").delete().eq("id", id(fd, "player_id", "Player"));
    return done("Player removed from the squad.");
  });
}
