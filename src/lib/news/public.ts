import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DATA_SOURCE_KIND } from "@/lib/data";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { supabaseEnv } from "@/lib/supabase/env";
import type { NewsPost } from "./types";

/*
 * Public news reads: anonymous role + publishable key, so RLS only ever
 * returns PUBLISHED posts that are due. Cached briefly and tagged with the
 * public data tag, which admin news actions invalidate on every change.
 * News must never take a page down: any failure returns an empty result.
 */

const TTL = 60;
const COLUMNS = "id, slug, title, summary, body, published_at, pinned, match_id";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */
function toPost(r: any): NewsPost {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary ?? "",
    body: r.body ?? "",
    publishedAt: r.published_at,
    pinned: Boolean(r.pinned),
    matchId: r.match_id ?? null,
  };
}

function client() {
  const env = supabaseEnv();
  if (DATA_SOURCE_KIND !== "live" || !env.ok) return null;
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: TTL, tags: [PUBLIC_DATA_TAG] } }) },
  });
}

/** Newest first; pinned posts lead. */
export async function listNews(limit = 30): Promise<NewsPost[]> {
  const db = client();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("news_posts")
      .select(COLUMNS)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(toPost);
  } catch (e) {
    console.error("[news] list failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getNews(slug: string): Promise<NewsPost | null> {
  const db = client();
  if (!db || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const { data, error } = await db.from("news_posts").select(COLUMNS).eq("slug", slug).maybeSingle();
    if (error) throw error;
    return data ? toPost(data) : null;
  } catch (e) {
    console.error("[news] get failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
