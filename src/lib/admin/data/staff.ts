import "server-only";
import type { StaffMember } from "../types";
import { adminDb, must, TEAM_REF } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

export async function listStaff(): Promise<StaffMember[]> {
  const { db } = await adminDb();
  const rows = must(await db.rpc("admin_list_staff"), "staff") as any[];
  return rows.map((r) => ({ ...r, active_assignments: Number(r.active_assignments) }));
}

/** Active staff who can be assigned to operate matches. */
export async function listAssignableOperators(): Promise<StaffMember[]> {
  return (await listStaff()).filter((s) => !s.deactivated_at && s.roles.some((r) => r === "OPERATOR" || r === "MANAGER" || r === "ADMIN"));
}

export async function listStaffAssignments(userId: string) {
  const { db } = await adminDb();
  const rows = must(
    await db
      .from("operator_assignments")
      .select(
        `role, active, assigned_at, revoked_at, match:matches(id, status, scheduled_at, round_label,
          competition:competitions(short_name), home:teams!matches_home_team_id_fkey(${TEAM_REF}), away:teams!matches_away_team_id_fkey(${TEAM_REF}))`,
      )
      .eq("user_id", userId)
      .order("assigned_at", { ascending: false })
      .limit(100),
    "assignments",
  ) as any[];
  return rows;
}
