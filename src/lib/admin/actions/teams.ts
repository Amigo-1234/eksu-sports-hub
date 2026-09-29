"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { redirect } from "next/navigation";
import type { ActionState } from "../types";
import { adminAction, check, id, Invalid, ok, oneOf, optionalId, slugify, text } from "./util";

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  updateTag(PUBLIC_DATA_TAG); // public pages see admin changes immediately
  return ok(msg);
};

const KINDS = ["FACULTY", "DEPARTMENT", "OTHER"] as const;
const CATEGORIES = ["MEN", "WOMEN", "MIXED"] as const;
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
