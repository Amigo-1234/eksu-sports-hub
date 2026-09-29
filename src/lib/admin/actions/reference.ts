"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import type { ActionState } from "../types";
import { adminAction, check, date, id, Invalid, ok, text } from "./util";

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  updateTag(PUBLIC_DATA_TAG); // public pages see admin changes immediately
  return ok(msg);
};

// ── Seasons ──────────────────────────────────────────────────────────────────
function seasonFields(fd: FormData) {
  const name = text(fd, "name", { label: "Season name", required: true, max: 60 });
  const starts_on = date(fd, "starts_on", "Start date");
  const ends_on = date(fd, "ends_on", "End date");
  if (ends_on <= starts_on) throw new Invalid("End date must be after the start date.");
  return { name, starts_on, ends_on };
}

export async function saveSeason(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const fields = seasonFields(fd);
    const seasonId = String(fd.get("id") ?? "");
    if (seasonId) {
      check(await db.from("seasons").update(fields).eq("id", id(fd, "id", "Season")));
      return done("Season updated.");
    }
    check(await db.from("seasons").insert(fields));
    return done("Season created.");
  });
}

export async function setCurrentSeason(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_set_current_season", { p_season_id: id(fd, "id", "Season") }));
    return done("Current season changed.");
  });
}

export async function setSeasonArchived(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const archive = fd.get("archive") === "1";
    check(await db.from("seasons").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id(fd, "id", "Season")));
    return done(archive ? "Season archived." : "Season restored.");
  });
}

// ── Faculties & departments ──────────────────────────────────────────────────
export async function saveFaculty(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const fields = {
      name: text(fd, "name", { label: "Faculty name", required: true, max: 120 }),
      code: text(fd, "code", { label: "Short name", required: true, max: 12 }).toUpperCase(),
    };
    if (fd.get("id")) {
      check(await db.from("faculties").update(fields).eq("id", id(fd, "id", "Faculty")));
      return done("Faculty updated.");
    }
    check(await db.from("faculties").insert(fields));
    return done("Faculty created.");
  });
}

export async function saveDepartment(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const fields = {
      faculty_id: id(fd, "faculty_id", "Faculty"),
      name: text(fd, "name", { label: "Department name", required: true, max: 120 }),
      code: text(fd, "code", { label: "Short name", required: true, max: 12 }).toUpperCase(),
    };
    if (fd.get("id")) {
      check(await db.from("departments").update(fields).eq("id", id(fd, "id", "Department")));
      return done("Department updated.");
    }
    check(await db.from("departments").insert(fields));
    return done("Department created.");
  });
}

// Deletion is refused by the database while anything depends on the row.
export async function deleteFaculty(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("faculties").delete().eq("id", id(fd, "id", "Faculty")));
    return done("Faculty deleted.");
  });
}

export async function deleteDepartment(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("departments").delete().eq("id", id(fd, "id", "Department")));
    return done("Department deleted.");
  });
}

// ── Venues ───────────────────────────────────────────────────────────────────
export async function saveVenue(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const fields = {
      name: text(fd, "name", { label: "Venue name", required: true, max: 120 }),
      short_name: text(fd, "short_name", { label: "Short name", required: true, max: 40 }),
      notes: text(fd, "notes", { label: "Notes", max: 1000 }),
    };
    if (fd.get("id")) {
      check(await db.from("venues").update(fields).eq("id", id(fd, "id", "Venue")));
      return done("Venue updated.");
    }
    check(await db.from("venues").insert(fields));
    return done("Venue created.");
  });
}

export async function deleteVenue(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("venues").delete().eq("id", id(fd, "id", "Venue")));
    return done("Venue deleted.");
  });
}
