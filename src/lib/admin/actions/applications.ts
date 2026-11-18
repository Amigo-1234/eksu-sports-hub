"use server";

import { revalidatePath } from "next/cache";
import { createInviteLink } from "../authAdmin";
import { confirmUrl, siteOriginForLinks } from "../links";
import type { ActionState } from "../types";
import { adminAction, check, fail, id, Invalid, ok, oneOf, text } from "./util";

/*
 * Operator application review. Reviewing (shortlist / approve / reject /
 * notes) never grants anything. Becoming an operator is a separate, explicit
 * step on an APPROVED application: the same invite flow as "Add staff member"
 * (password-less account + one-time link, OPERATOR role granted through the
 * audited admin_grant_role RPC). All writes run as the signed-in admin under
 * RLS and are audited.
 */

const done = (msg: string, data?: Record<string, string>) => {
  revalidatePath("/admin/applications", "layout");
  return ok(msg, data);
};

type Row = { id: string; status: string; email: string; full_name: string };

async function load(db: Parameters<Parameters<typeof adminAction>[0]>[0]["db"], appId: string): Promise<Row> {
  const row = check(await db.from("operator_applications").select("id, status, email, full_name").eq("id", appId).maybeSingle()) as Row | null;
  if (!row) throw new Invalid("Application not found.");
  return row;
}

export async function reviewApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db, admin }) => {
    const appId = id(fd, "id", "Application");
    const status = oneOf(fd, "status", ["NEW", "SHORTLISTED", "APPROVED", "REJECTED"] as const, "decision");
    const row = await load(db, appId);
    if (row.status === "INVITED") throw new Invalid("This applicant has already been invited as an operator. Manage them under Staff & Operators.");
    check(
      await db
        .from("operator_applications")
        .update({ status, reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
        .eq("id", appId),
    );
    const verb = { NEW: "moved back to New", SHORTLISTED: "shortlisted", APPROVED: "approved", REJECTED: "rejected" }[status];
    return done(`Application ${verb}.`);
  });
}

export async function saveApplicationNotes(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const appId = id(fd, "id", "Application");
    const notes = text(fd, "review_notes", { label: "Notes", max: 4000 });
    check(await db.from("operator_applications").update({ review_notes: notes }).eq("id", appId));
    return done("Notes saved.");
  });
}

/** The explicit activation step: invite an APPROVED applicant as an OPERATOR. */
export async function inviteApplicant(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const appId = id(fd, "id", "Application");
    if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "INVITE") throw new Invalid("Type INVITE to confirm.");
    const displayName = text(fd, "display_name", { label: "Display name", required: true, max: 80 });
    const row = await load(db, appId);
    if (row.status !== "APPROVED") throw new Invalid("Only an approved application can be invited.");
    const link = await createInviteLink(row.email, displayName);
    if (!link.ok) return fail(link.error);
    // Same as "Add staff member": Postgres re-checks ADMIN and audits the grant.
    check(await db.rpc("admin_grant_role", { p_user_id: link.userId, p_role: "OPERATOR" }));
    check(
      await db
        .from("operator_applications")
        .update({ status: "INVITED", invited_user_id: link.userId, invited_at: new Date().toISOString() })
        .eq("id", appId),
    );
    revalidatePath("/admin/staff");
    return done(`Invite created for ${row.email}. Share the link privately; it works once.`, {
      link: confirmUrl(await siteOriginForLinks(), link.tokenHash, "invite"),
    });
  });
}
