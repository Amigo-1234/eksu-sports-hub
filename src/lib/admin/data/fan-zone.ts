import "server-only";
import { adminDb, must } from "./db";

export interface FanCommentRow {
  id: string;
  target_kind: "match" | "news";
  target_id: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  report_count: number;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
}

export type FanFilter = "reported" | "hidden" | "all";

/** Fan comments for moderation (admins only, under RLS). */
export async function listFanComments(filter: FanFilter, q?: string): Promise<FanCommentRow[]> {
  const { db } = await adminDb();
  let query = db
    .from("fan_comments")
    .select("id, target_kind, target_id, parent_id, author_name, body, report_count, hidden_at, hidden_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "reported") query = query.gt("report_count", 0).is("hidden_at", null);
  if (filter === "hidden") query = query.not("hidden_at", "is", null);
  if (q) query = query.or(`body.ilike.%${q.replace(/[%,()*]/g, " ")}%,author_name.ilike.%${q.replace(/[%,()*]/g, " ")}%`);
  return must(await query, "fan comments") as FanCommentRow[];
}
