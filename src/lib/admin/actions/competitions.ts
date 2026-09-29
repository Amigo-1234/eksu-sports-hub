"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { redirect } from "next/navigation";
import { TIEBREAKERS, type ActionState, type Tiebreaker } from "../types";
import { adminAction, bool, check, id, int, Invalid, ok, oneOf, optionalId, text } from "./util";

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  updateTag(PUBLIC_DATA_TAG); // public pages see admin changes immediately
  return ok(msg);
};

const FORMATS = ["LEAGUE", "KNOCKOUT", "GROUPS_KNOCKOUT"] as const;
const CATEGORIES = ["MEN", "WOMEN", "MIXED"] as const;
const STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

function tiebreakers(fd: FormData): Tiebreaker[] {
  const list = fd
    .getAll("tiebreakers")
    .map(String)
    .filter((t): t is Tiebreaker => (TIEBREAKERS as readonly string[]).includes(t));
  const unique = [...new Set(list)];
  if (unique.length === 0) throw new Invalid("Choose at least one tie-breaker.");
  return unique;
}

function competitionFields(fd: FormData) {
  const points_win = int(fd, "points_win", "Points for a win", 0, 10);
  const points_draw = int(fd, "points_draw", "Points for a draw", 0, 10);
  const points_loss = int(fd, "points_loss", "Points for a loss", 0, 10);
  if (!(points_win >= points_draw && points_draw >= points_loss)) throw new Invalid("Points must satisfy win ≥ draw ≥ loss.");
  return {
    name: text(fd, "name", { label: "Competition name", required: true, max: 120 }),
    short_name: text(fd, "short_name", { label: "Short name", required: true, max: 40 }),
    description: text(fd, "description", { label: "Description", max: 1000 }),
    season_id: id(fd, "season_id", "Season"),
    sport_id: id(fd, "sport_id", "Sport"),
    format: oneOf(fd, "format", FORMATS, "format"),
    category: oneOf(fd, "category", CATEGORIES, "category"),
    points_win,
    points_draw,
    points_loss,
    tiebreakers: tiebreakers(fd),
    extra_time_enabled: bool(fd, "extra_time_enabled"),
    penalties_enabled: bool(fd, "penalties_enabled"),
  };
}

export async function createCompetition(_: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await adminAction(async ({ db }) => {
    const fields = { ...competitionFields(fd), status: "DRAFT" };
    const row = check(await db.from("competitions").insert(fields).select("id").single()) as { id: string };
    newId = row.id;
    // Every competition needs at least one stage for fixtures and tables.
    check(await db.from("competition_stages").insert({ competition_id: row.id, name: fields.format === "KNOCKOUT" ? "Knockout" : "League phase", stage_order: 1, has_table: fields.format !== "KNOCKOUT" }));
    return done("Competition created as a draft.");
  });
  if (res?.ok && newId) redirect(`/admin/competitions/${newId}?created=1`);
  return res;
}

export async function updateCompetition(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("competitions").update(competitionFields(fd)).eq("id", id(fd, "id", "Competition")));
    return done("Competition settings saved.");
  });
}

export async function setCompetitionStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const status = oneOf(fd, "status", STATUSES, "status");
    check(await db.from("competitions").update({ status }).eq("id", id(fd, "id", "Competition")));
    return done(status === "ACTIVE" ? "Competition activated." : status === "ARCHIVED" ? "Competition archived." : "Competition moved back to draft.");
  });
}

export async function saveStage(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const fields = {
      name: text(fd, "name", { label: "Stage name", required: true, max: 60 }),
      stage_order: int(fd, "stage_order", "Order", 1, 20),
      has_table: bool(fd, "has_table"),
    };
    if (fd.get("id")) {
      check(await db.from("competition_stages").update(fields).eq("id", id(fd, "id", "Stage")));
      return done("Stage updated.");
    }
    check(await db.from("competition_stages").insert({ ...fields, competition_id: id(fd, "competition_id", "Competition") }));
    return done("Stage added.");
  });
}

export async function deleteStage(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("competition_stages").delete().eq("id", id(fd, "id", "Stage")));
    return done("Stage removed.");
  });
}

export async function addGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("competition_groups").insert({ stage_id: id(fd, "stage_id", "Stage"), name: text(fd, "name", { label: "Group name", required: true, max: 40 }) }));
    return done("Group added.");
  });
}

export async function deleteGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("competition_groups").delete().eq("id", id(fd, "id", "Group")));
    return done("Group removed.");
  });
}

/** "stageId:groupId" from the combined stage/group picker. */
function placement(fd: FormData): { stage_id: string | null; group_id: string | null } {
  const raw = String(fd.get("placement") ?? "");
  if (!raw) return { stage_id: null, group_id: null };
  const [stage, group] = raw.split(":");
  const f = new FormData();
  f.set("s", stage ?? "");
  f.set("g", group ?? "");
  return { stage_id: optionalId(f, "s"), group_id: optionalId(f, "g") };
}

async function checkPlacement(db: Parameters<Parameters<typeof adminAction>[0]>[0]["db"], competitionId: string, p: { stage_id: string | null; group_id: string | null }) {
  if (!p.stage_id) return;
  const stage = check(await db.from("competition_stages").select("id, competition_groups(id)").eq("id", p.stage_id).eq("competition_id", competitionId).maybeSingle()) as {
    competition_groups: { id: string }[];
  } | null;
  if (!stage) throw new Invalid("That stage does not belong to this competition.");
  if (p.group_id && !stage.competition_groups.some((g) => g.id === p.group_id)) throw new Invalid("That group does not belong to the stage.");
}

export async function addEntries(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const competition_id = id(fd, "competition_id", "Competition");
    const { stage_id, group_id } = placement(fd);
    await checkPlacement(db, competition_id, { stage_id, group_id });
    const teams = fd.getAll("team_id").map(String).filter(Boolean);
    if (teams.length === 0) throw new Invalid("Choose at least one team.");
    const rows = teams.map((t) => {
      if (!/^[0-9a-f-]{36}$/i.test(t)) throw new Invalid("An invalid team was submitted.");
      return { competition_id, stage_id, group_id, team_id: t };
    });
    check(await db.from("competition_entries").insert(rows));
    return done(`${rows.length} team${rows.length === 1 ? "" : "s"} entered.`);
  });
}

export async function updateEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const p = placement(fd);
    await checkPlacement(db, id(fd, "competition_id", "Competition"), p);
    check(await db.from("competition_entries").update(p).eq("id", id(fd, "id", "Entry")));
    return done("Entry updated.");
  });
}

export async function removeEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.from("competition_entries").delete().eq("id", id(fd, "id", "Entry")));
    return done("Team withdrawn from the competition.");
  });
}

export async function recomputeStandings(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_recompute_standings", { p_competition_id: id(fd, "competition_id", "Competition") }));
    return done("Standings recomputed from finished matches.");
  });
}
