"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { NEWS_CATEGORIES } from "@/lib/news/feed";
import { STORIES } from "@/lib/news/stories";
import { fromWatInput } from "../time";
import type { ActionState } from "../types";
import { adminAction, bool, check, id, Invalid, ok, oneOf, optionalId, text } from "./util";

/** URL-safe web address from a title ("Civil 400L v 500L!" → "civil-400l-v-500l"). */
function newsSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const CATEGORIES = Object.keys(NEWS_CATEGORIES) as (keyof typeof NEWS_CATEGORIES)[];
// Web addresses already used by stories published in code (src/lib/news/stories.ts).
const CODE_IDS = new Set(STORIES.map((s) => s.id));

/*
 * Sports News published from the dashboard. Plain table writes as the signed-in admin: RLS allows ADMIN
 * only and the audit trigger records every change. Public pages see a post
 * as soon as it is published (the public data tag is invalidated).
 */

const done = (msg: string) => {
  revalidatePath("/admin/news", "layout");
  updateTag(PUBLIC_DATA_TAG);
  updateTag("sports-news");
  return ok(msg);
};

function fields(fd: FormData, existingPublishedAt: string | null) {
  const title = text(fd, "title", { label: "Title", required: true, max: 140 });
  if (title.length < 3) throw new Invalid("The title must be at least 3 characters.");
  const slug = newsSlug(text(fd, "slug", { label: "Web address", max: 90 }) || title);
  if (!slug) throw new Invalid("The web address needs letters or numbers.");
  if (CODE_IDS.has(slug)) throw new Invalid("That web address is already used by another story. Change the title or web address.");
  const publish = String(fd.get("intent") ?? "") === "publish";
  const when = String(fd.get("published_at") ?? "").trim();
  let published_at: string | null = existingPublishedAt;
  if (when) {
    published_at = fromWatInput(when);
    if (!published_at) throw new Invalid("Enter a valid publish date and time (campus time, WAT).");
  } else if (publish && !published_at) {
    published_at = new Date().toISOString();
  }
  return {
    title,
    slug,
    summary: text(fd, "summary", { label: "Summary", max: 300 }),
    body: text(fd, "body", { label: "Story", max: 20000 }),
    status: publish ? "PUBLISHED" : "DRAFT",
    published_at,
    pinned: bool(fd, "pinned"),
    category: oneOf(fd, "category", CATEGORIES, "category"),
    kind: oneOf(fd, "kind", ["report", "opinion"] as const, "type"),
    match_id: optionalId(fd, "match_id"),
  };
}

const slugTaken = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";

export async function createNews(_: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await adminAction(async ({ db }) => {
    const row = fields(fd, null);
    // Keep web addresses unique: civil-derby, civil-derby-2, …
    for (let n = 1; n <= 20; n++) {
      const slug = n === 1 ? row.slug : `${row.slug.slice(0, 85)}-${n}`;
      const { data, error } = await db.from("news_posts").insert({ ...row, slug }).select("id").single();
      if (!error) {
        newId = (data as { id: string }).id;
        return done(row.status === "PUBLISHED" ? "Story published." : "Draft saved.");
      }
      if (!slugTaken(error)) check({ data: null, error });
    }
    throw new Invalid("Choose a different web address.");
  });
  if (res?.ok && newId) redirect(`/admin/news/${newId}?saved=1`);
  return res;
}

export async function updateNews(_: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ db }) => {
    const postId = id(fd, "id", "Story");
    const current = check(await db.from("news_posts").select("published_at").eq("id", postId).single()) as { published_at: string | null };
    const row = fields(fd, current.published_at);
    const { error } = await db.from("news_posts").update(row).eq("id", postId);
    if (error && slugTaken(error)) throw new Invalid("Another story already uses that web address.");
    check({ data: null, error });
    return done(row.status === "PUBLISHED" ? "Story saved and published." : "Saved as a draft (not public).");
  });
}

export async function deleteNews(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ db }) => {
    check(await db.from("news_posts").delete().eq("id", id(fd, "id", "Story")));
    return done("Story deleted.");
  });
  if (res?.ok) redirect("/admin/news");
  return res;
}
