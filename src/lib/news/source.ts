import "server-only";
import { parseNewsFeed, type NewsPage } from "./feed";

/**
 * Server-side, read-only fetch of published Sports News previews from Amigo
 * World. Configured with AMIGO_NEWS_FEED_URL (a public, read-only feed: no
 * credentials). Unset → "unconfigured" (news UI stays hidden). Any failure or
 * slow response → "unavailable" (the rest of the site is unaffected).
 * Cached for 5 minutes, so unpublished stories drop out within that window.
 */
const REVALIDATE_SECONDS = 300;
const TIMEOUT_MS = 3000;
export const NEWS_PAGE_SIZE = 12;

export async function getNews({ page = 1, limit = NEWS_PAGE_SIZE }: { page?: number; limit?: number } = {}): Promise<NewsPage> {
  const feed = process.env.AMIGO_NEWS_FEED_URL;
  if (!feed) return { status: "unconfigured", items: [], hasMore: false };
  let articleHost: string | null = null;
  try {
    const origin = process.env.AMIGO_WORLD_ORIGIN;
    articleHost = origin ? new URL(origin).host : null;
    const url = new URL(feed);
    url.searchParams.set("page", String(Math.max(1, Math.floor(page))));
    url.searchParams.set("limit", String(Math.min(50, Math.max(1, Math.floor(limit)))));
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["sports-news"] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { status: "unavailable", items: [], hasMore: false };
    return { status: "ok", ...parseNewsFeed(await res.json(), articleHost) };
  } catch {
    return { status: "unavailable", items: [], hasMore: false };
  }
}
