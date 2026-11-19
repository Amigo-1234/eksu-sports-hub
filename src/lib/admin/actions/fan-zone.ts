"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "../types";
import { adminAction, check, id, Invalid, ok, oneOf, text } from "./util";

/** Hide or restore a fan comment. Runs as the signed-in admin under RLS; audited by trigger. */
export async function moderateFanComment(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db, admin }) => {
    const commentId = id(fd, "id", "Comment");
    const op = oneOf(fd, "op", ["hide", "restore"] as const, "action");
    const reason = text(fd, "reason", { label: "Reason", max: 300 });
    const patch =
      op === "hide"
        ? { hidden_at: new Date().toISOString(), hidden_reason: reason || "Removed by moderator", hidden_by: admin.id }
        : { hidden_at: null, hidden_reason: null, hidden_by: null };
    const rows = check(await db.from("fan_comments").update(patch).eq("id", commentId).select("id"));
    if (!rows?.length) throw new Invalid("Comment not found.");
    revalidatePath("/admin/fan-zone");
    return ok(op === "hide" ? "Comment hidden from the public site." : "Comment restored.");
  });
}
