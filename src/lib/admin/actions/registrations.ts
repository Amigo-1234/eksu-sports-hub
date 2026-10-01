"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromWatInput } from "../time";
import type { ActionState } from "../types";
import { adminAction, bool, check, id, Invalid, ok, oneOf, text } from "./util";

/*
 * Registration windows and the review of submitted registrations. Every
 * write is an admin_* RPC: ADMIN re-checked, transitions enforced and
 * audited in Postgres. Accepting is the only path from a registration into
 * the official player / screening records, and it never clears anyone.
 */

const done = (msg: string) => {
  revalidatePath("/admin", "layout");
  revalidatePath("/register", "layout");
  return ok(msg);
};

/** Decisions change which buttons exist, so the result is shown on the reloaded detail page. */
function backToDetail(fd: FormData, res: ActionState): ActionState {
  const rid = String(fd.get("registration_id") ?? "");
  if (res?.ok && /^[0-9a-f-]{36}$/i.test(rid)) redirect(`/admin/registrations/${rid}?notice=${encodeURIComponent(res.message ?? "Saved.")}`);
  return res;
}

function windowFields(fd: FormData) {
  const opens = fromWatInput(String(fd.get("opens_at") ?? ""));
  if (!opens) throw new Invalid("Choose when registration opens.");
  const closesRaw = String(fd.get("closes_at") ?? "").trim();
  const closes = closesRaw ? fromWatInput(closesRaw) : null;
  if (closesRaw && !closes) throw new Invalid("The closing time is not a valid date.");
  return {
    p_title: text(fd, "title", { label: "Title", required: true, max: 120 }),
    p_slug: text(fd, "slug", { label: "Link name", required: true, max: 60 }).toLowerCase(),
    p_reference_code: text(fd, "reference_code", { label: "Reference code", required: true, max: 6 }).toUpperCase(),
    p_opens_at: opens,
    p_closes_at: closes,
    p_allow_player: bool(fd, "allow_player"),
    p_allow_team: bool(fd, "allow_team"),
    p_instructions: text(fd, "instructions", { label: "Instructions", max: 4000 }),
  };
}

export async function createRegistrationWindow(_: ActionState, fd: FormData): Promise<ActionState> {
  let created: string | null = null;
  const res = await adminAction(async ({ db }) => {
    created = check(await db.rpc("admin_create_registration_window", { p_competition_id: id(fd, "competition_id", "Competition"), ...windowFields(fd) })) as string;
    return done("Registration window created as a draft.");
  });
  if (res?.ok && created) redirect(`/admin/registrations/windows/${created}?notice=created`);
  return res;
}

export async function updateRegistrationWindow(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    check(await db.rpc("admin_update_registration_window", { p_window_id: id(fd, "window_id", "Window"), ...windowFields(fd) }));
    return done("Registration window saved.");
  });
}

export async function setRegistrationWindowStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    const status = oneOf(fd, "status", ["OPEN", "CLOSED", "ARCHIVED"] as const, "status");
    check(await db.rpc("admin_set_registration_window_status", { p_window_id: id(fd, "window_id", "Window"), p_status: status }));
    return done({ OPEN: "Registration is open.", CLOSED: "Registration is closed.", ARCHIVED: "Window archived." }[status]);
  });
  const wid = String(fd.get("window_id") ?? "");
  if (res?.ok && /^[0-9a-f-]{36}$/i.test(wid)) redirect(`/admin/registrations/windows/${wid}?notice=${encodeURIComponent(res.message ?? "Saved.")}`);
  return res;
}

export async function reviewRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    const status = oneOf(fd, "status", ["UNDER_REVIEW", "NEEDS_CORRECTION", "REJECTED"] as const, "decision");
    const reason = text(fd, "reason", { label: "Reason", max: 500 });
    if (status !== "UNDER_REVIEW" && !reason) throw new Invalid("A reason is required.");
    check(
      await db.rpc("admin_review_registration", {
        p_registration_id: id(fd, "registration_id", "Registration"),
        p_status: status,
        p_reason: reason || null,
        p_notes: text(fd, "notes", { label: "Notes", max: 1000 }) || null,
      }),
    );
    return done({ UNDER_REVIEW: "Marked as under review.", NEEDS_CORRECTION: "Correction requested.", REJECTED: "Registration rejected." }[status]);
  });
  return backToDetail(fd, res);
}

export async function acceptRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    const r = check(
      await db.rpc("admin_accept_registration", {
        p_registration_id: id(fd, "registration_id", "Registration"),
        p_notes: text(fd, "notes", { label: "Notes", max: 1000 }) || null,
      }),
    ) as { created: number; linked: number; screenings_opened: number };
    const parts = [
      r.created ? `${r.created} new player record${r.created > 1 ? "s" : ""}` : "",
      r.linked ? `${r.linked} linked to existing record${r.linked > 1 ? "s" : ""}` : "",
      `${r.screenings_opened} pending screening${r.screenings_opened === 1 ? "" : "s"} opened`,
    ].filter(Boolean);
    return done(`Accepted for screening: ${parts.join(", ")}. Nobody is cleared until screened.`);
  });
  return backToDetail(fd, res);
}

export async function rejectRegistrationPlayer(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    const reason = text(fd, "reason", { label: "Reason", required: true, max: 500 });
    check(await db.rpc("admin_reject_registration_player", { p_registration_player_id: id(fd, "person_id", "Player"), p_reason: reason }));
    return done("Player left out of this registration.");
  });
  return backToDetail(fd, res);
}

// ── Admin-led registration (same intake model as the public form) ─────────────
export interface AdminPersonInput {
  full_name: string;
  matric_number: string;
  faculty_id: string;
  department_id: string | null;
  level: string;
  phone: string | null;
  position: string;
  team_id: string | null;
}
export interface AdminRegistrationInput {
  window_id: string;
  type: "PLAYER_SELF" | "TEAM_ROSTER";
  team_id: string;
  submitter: { name: string; phone: string; email: string | null };
  players: AdminPersonInput[];
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const u = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
function person(p: Partial<AdminPersonInput> | undefined) {
  return {
    full_name: s(p?.full_name, 80),
    matric_number: s(p?.matric_number, 40),
    faculty_id: u(p?.faculty_id),
    department_id: u(p?.department_id),
    level: s(p?.level, 8),
    phone: s(p?.phone, 20) || null,
    position: s(p?.position, 8),
    team_id: u(p?.team_id),
  };
}

/** Creates a registration on someone's behalf; Postgres validates and de-duplicates exactly like the public path. */
export async function adminCreateRegistration(input: AdminRegistrationInput): Promise<{ ok: true; id: string; reference: string } | { ok: false; error: string }> {
  let created: { id: string; reference: string } | null = null;
  const res = await adminAction(async ({ db }) => {
    if (!Array.isArray(input?.players) || input.players.length === 0) throw new Invalid("Add at least one player.");
    if (input.players.length > 40) throw new Invalid("A roster can have at most 40 players.");
    const type = input.type === "TEAM_ROSTER" ? "TEAM_ROSTER" : "PLAYER_SELF";
    const team = u(input.team_id);
    const r = check(
      await db.rpc("admin_create_registration", {
        p: {
          window_id: u(input.window_id),
          type,
          team_id: team,
          submitter: { name: s(input.submitter?.name, 80), phone: s(input.submitter?.phone, 20), email: s(input.submitter?.email, 120) || null },
          players: input.players.map((p) => ({ ...person(p), team_id: team })),
        },
      }),
    ) as { id: string; reference: string };
    created = r;
    return done(`Registration ${r.reference} created.`);
  });
  if (res?.ok && created) return { ok: true, ...(created as { id: string; reference: string }) };
  return { ok: false, error: res && !res.ok ? (res.error ?? "Could not create the registration.") : "Could not create the registration." };
}

export async function updateRegistrationPerson(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_update_registration_player", {
        p_registration_player_id: id(fd, "person_id", "Player"),
        p: person({
          full_name: String(fd.get("full_name") ?? ""),
          matric_number: String(fd.get("matric_number") ?? ""),
          faculty_id: String(fd.get("faculty_id") ?? ""),
          department_id: String(fd.get("department_id") ?? "") || null,
          level: String(fd.get("level") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          position: String(fd.get("position") ?? ""),
          team_id: String(fd.get("team_id") ?? "") || null,
        }),
      }),
    );
    return done("Entry corrected. The change is recorded in the history.");
  });
  return backToDetail(fd, res);
}

export async function updateRegistrationContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    check(
      await db.rpc("admin_update_registration_contact", {
        p_registration_id: id(fd, "registration_id", "Registration"),
        p_name: text(fd, "name", { label: "Name", required: true, max: 80 }),
        p_phone: text(fd, "phone", { label: "Phone", required: true, max: 20 }),
        p_email: text(fd, "email", { label: "Email", max: 120 }) || null,
      }),
    );
    return done("Contact details corrected. The change is recorded in the history.");
  });
  return backToDetail(fd, res);
}
