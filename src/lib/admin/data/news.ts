import "server-only";
import { adminDb, must } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

export interface AdminNewsPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  published_at: string | null;
  pinned: boolean;
  match_id: string | null;
  updated_at: string;
}

export interface NewsMatchOption {
  id: string;
  label: string;
}

const COLS = "id, slug, title, summary, body, status, published_at, pinned, match_id, updated_at";

export async function listNewsPosts(): Promise<AdminNewsPost[]> {
  const { db } = await adminDb();
  return must(
    await db.from("news_posts").select(COLS).order("published_at", { ascending: false, nullsFirst: true }).order("updated_at", { ascending: false }),
    "news",
  ) as AdminNewsPost[];
}

export async function getNewsPost(id: string): Promise<AdminNewsPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { db } = await adminDb();
  return must(await db.from("news_posts").select(COLS).eq("id", id).maybeSingle(), "news post") as AdminNewsPost | null;
}

/** Recent and upcoming official fixtures a story can be linked to. */
export async function newsMatchOptions(): Promise<NewsMatchOption[]> {
  const { db } = await adminDb();
  const from = new Date(Date.now() - 21 * 864e5).toISOString();
  const to = new Date(Date.now() + 90 * 864e5).toISOString();
  const rows = must(
    await db
      .from("matches")
      .select("id, scheduled_at, round_label, home:home_team_id(short_name), away:away_team_id(short_name), competition:competition_id(short_name, status)")
      .eq("is_demo", false)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .order("scheduled_at"),
    "matches",
  ) as any[];
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return rows
    .filter((r) => r.competition?.status !== "DRAFT")
    .map((r) => ({ id: r.id, label: `${fmt.format(new Date(r.scheduled_at))} · ${r.home?.short_name} v ${r.away?.short_name} (${r.competition?.short_name})` }));
}
