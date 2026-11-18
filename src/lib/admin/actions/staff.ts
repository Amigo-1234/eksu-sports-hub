"use server";

import { revalidatePath } from "next/cache";
import { createInviteLink, createRecoveryLink, setSignInBlocked } from "../authAdmin";
import { confirmUrl, siteOriginForLinks as origin } from "../links";
import { STAFF_ROLES, type ActionState } from "../types";
import { adminAction, check, fail, id, Invalid, ok, oneOf, text } from "./util";

const done = (msg: string, data?: Record<string, string>) => {
  revalidatePath("/admin", "layout");
  return ok(msg, data);
};


const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a staff account WITHOUT a password: the person opens a one-time
 * link and chooses their own. The link is shown once to the admin to share
 * privately; nothing secret is stored in our tables.
 */
export async function inviteStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const email = text(fd, "email", { label: "Email", required: true, max: 200 }).toLowerCase();
    if (!EMAIL.test(email)) throw new Invalid("Enter a valid email address.");
    const displayName = text(fd, "display_name", { label: "Display name", required: true, max: 80 });
    const role = oneOf(fd, "role", STAFF_ROLES, "role");
    const link = await createInviteLink(email, displayName);
    if (!link.ok) return fail(link.error);
    // Granted as the signed-in admin: Postgres re-checks ADMIN and audits it.
    check(await db.rpc("admin_grant_role", { p_user_id: link.userId, p_role: role }));
    return done(`Invite created for ${email}.`, { link: confirmUrl(await origin(), link.tokenHash, "invite"), userId: link.userId });
  });
}

export async function createResetLink(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async () => {
    const email = text(fd, "email", { label: "Email", required: true, max: 200 }).toLowerCase();
    const link = await createRecoveryLink(email);
    if (!link.ok) return fail(link.error);
    return ok(`Password link created for ${email}.`, { link: confirmUrl(await origin(), link.tokenHash, "recovery") });
  });
}

export async function grantRole(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const role = oneOf(fd, "role", STAFF_ROLES, "role");
    check(await db.rpc("admin_grant_role", { p_user_id: id(fd, "user_id", "Staff member"), p_role: role }));
    return done(`${role} role granted.`);
  });
}

export async function revokeRole(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const role = oneOf(fd, "role", STAFF_ROLES, "role");
    check(await db.rpc("admin_revoke_role", { p_user_id: id(fd, "user_id", "Staff member"), p_role: role }));
    return done(`${role} role removed.`);
  });
}

export async function setStaffActive(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const userId = id(fd, "user_id", "Staff member");
    const active = fd.get("active") === "1";
    // Postgres is authoritative (deactivated staff lose every role at once).
    check(await db.rpc("admin_set_staff_active", { p_user_id: userId, p_active: active }));
    const ban = await setSignInBlocked(userId, !active);
    const note = ban.ok ? "" : " (Sign-in could not be blocked at the auth service; their roles are disabled in the database.)";
    return done((active ? "Staff member reactivated." : "Staff member deactivated.") + (active ? "" : note));
  });
}
