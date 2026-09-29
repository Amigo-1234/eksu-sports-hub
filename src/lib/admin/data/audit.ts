import "server-only";
import { watDayRange } from "../time";
import type { AuditEntry, AuditFilters } from "../types";
import { adminDb, must } from "./db";

export const AUDIT_PAGE_SIZE = 50;

/** Read-only: the audit log cannot be edited or deleted by anyone (trigger-enforced). */
export async function listAudit(f: AuditFilters): Promise<{ rows: AuditEntry[]; hasMore: boolean }> {
  const { db } = await adminDb();
  const page = Math.max(0, f.page ?? 0);
  let q = db
    .from("audit_log")
    .select("id, created_at, action, entity_type, entity_id, match_id, before_state, after_state, actor:profiles!audit_log_actor_id_fkey(id, display_name)")
    .order("created_at", { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE);
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.action) q = q.eq("action", f.action);
  if (f.entity) q = q.eq("entity_type", f.entity);
  if (f.match) q = q.eq("match_id", f.match);
  const from = f.from ? watDayRange(f.from) : null;
  const to = f.to ? watDayRange(f.to) : null;
  if (from) q = q.gte("created_at", from.from);
  if (to) q = q.lt("created_at", to.to);
  const rows = must(await q, "audit log") as unknown as AuditEntry[];
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}

/** Distinct actions and entity types for the filter menus. */
export async function auditFacets(): Promise<{ actions: string[]; entities: string[] }> {
  const { db } = await adminDb();
  const rows = must(await db.from("audit_log").select("action, entity_type").order("created_at", { ascending: false }).limit(2000), "audit facets") as {
    action: string;
    entity_type: string;
  }[];
  return {
    actions: [...new Set(rows.map((r) => r.action))].sort(),
    entities: [...new Set(rows.map((r) => r.entity_type))].sort(),
  };
}
