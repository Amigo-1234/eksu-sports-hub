import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DATA_SOURCE_KIND } from "@/lib/data";
import { PUBLIC_DATA_TAG } from "@/lib/data/cacheTags";
import { supabaseEnv } from "@/lib/supabase/env";
import type { NewsCategory } from "./feed";
import { publishedStories, type Story } from "./stories";

/*
 * Stories published from the admin dashboard (table news_posts), merged with
 * the stories published in code (./stories.ts) into one Sports News feed.
 * Reads run as the anonymous role, so RLS returns only PUBLISHED posts whose
 * publish time has passed. Fail-safe: any error → no dashboard stories, and
 * the code stories still show. Admin news actions invalidate the cache tags.
 */

export const NEWS_TAG = "sports-news";
const TTL = 60;
const COLUMNS = "slug, title, summary, body, category, kind, published_at, pinned, match_id";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */
function toStory(r: any): Story {
  return {
    id: r.slug,
    published: true,
    featured: Boolean(r.pinned),
    category: r.category as NewsCategory,
    kind: r.kind === "opinion" ? "opinion" : "report",
    publishedAt: r.published_at,
    headline: r.title,
    summary: r.summary ?? "",
    // Blank lines separate paragraphs.
    body: String(r.body ?? "")
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean),
    image: null,
    gallery: [],
    imageCredit: null,
    matchId: r.match_id ?? null,
  };
}

function client() {
  const env = supabaseEnv();
  if (DATA_SOURCE_KIND !== "live" || !env.ok) return null;
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: TTL, tags: [NEWS_TAG, PUBLIC_DATA_TAG] } }) },
  });
}

async function dashboardStories(): Promise<Story[]> {
  const db = client();
  if (!db) return [];
  try {
    const { data, error } = await db.from("news_posts").select(COLUMNS).order("published_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []).map(toStory);
  } catch (e) {
    console.error("[news] dashboard stories unavailable:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Every published story, newest first. A code story wins if an id is ever shared. */
export async function allStories(): Promise<Story[]> {
  const code = publishedStories();
  const ids = new Set(code.map((s) => s.id));
  const dash = (await dashboardStories()).filter((s) => !ids.has(s.id));
  return [...code, ...dash].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export async function findStory(id: string): Promise<Story | null> {
  return (await allStories()).find((s) => s.id === id) ?? null;
}
