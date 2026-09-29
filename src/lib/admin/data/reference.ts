import "server-only";
import type { Faculty, Season, Sport, Venue } from "../types";
import { adminDb, must } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

export async function listSeasons(): Promise<Season[]> {
  const { db } = await adminDb();
  return must(
    await db.from("seasons").select("id, name, starts_on, ends_on, is_current, archived_at").order("starts_on", { ascending: false }),
    "seasons",
  ) as Season[];
}

export async function listSports(): Promise<Sport[]> {
  const { db } = await adminDb();
  return must(await db.from("sports").select("id, code, name").eq("active", true).order("name"), "sports") as Sport[];
}

export async function listFaculties(): Promise<Faculty[]> {
  const { db } = await adminDb();
  const rows = must(
    await db
      .from("faculties")
      .select("id, name, code, teams(count), departments(id, faculty_id, name, code, teams(count))")
      .order("name"),
    "faculties",
  ) as any[];
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    team_count: f.teams?.[0]?.count ?? 0,
    departments: (f.departments ?? [])
      .map((d: any) => ({ id: d.id, faculty_id: d.faculty_id, name: d.name, code: d.code, team_count: d.teams?.[0]?.count ?? 0 }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name)),
  }));
}

export async function listVenues(): Promise<Venue[]> {
  const { db } = await adminDb();
  const rows = must(await db.from("venues").select("id, name, short_name, notes, matches(id)").order("name"), "venues") as any[];
  return rows.map((v) => ({ id: v.id, name: v.name, short_name: v.short_name, notes: v.notes, match_count: v.matches?.length ?? 0 }));
}
