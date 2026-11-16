import "server-only";
import { adminDb, must } from "./db";

export interface SiteVisitor {
  name: string;
  contact: string | null;
  contact_kind: "email" | "phone" | null;
  first_seen_at: string;
  last_seen_at: string;
  visit_days: number;
}

export interface VisitorTotals {
  visitors: number;
  with_contact: number;
  today: number;
  last_7_days: number;
  new_last_7_days: number;
}

export const VISITORS_PAGE_SIZE = 100;

/** People who signed in on the public site ("What should we call you?"). Admins only. */
export async function listVisitors(search: string | undefined, page: number) {
  const { db } = await adminDb();
  const data = must(
    await db.rpc("admin_site_visitors", {
      p_search: search ?? null,
      p_limit: VISITORS_PAGE_SIZE,
      p_offset: page * VISITORS_PAGE_SIZE,
    }),
    "visitors",
  ) as { totals: VisitorTotals; rows: SiteVisitor[] };
  return {
    totals: data.totals,
    rows: data.rows.slice(0, VISITORS_PAGE_SIZE),
    hasMore: data.rows.length > VISITORS_PAGE_SIZE,
  };
}
