/**
 * Sports News previews from Amigo World (the canonical home of full articles
 * and their discussions). Read-only: EKSU Sports Hub never stores, edits or
 * publishes news itself. Pure parsing lives here so it can be unit-tested;
 * fetching is in ./source.ts.
 *
 * Feed contract (served by Amigo World, see docs/NEWS_INTEGRATION.md):
 *   GET <AMIGO_NEWS_FEED_URL>?page=1&limit=12  →
 *   { "items": [ { "id", "status": "published", "headline", "summary", "category",
 *       "kind": "report" | "opinion", "published_at", "url", "image_url", "image_alt",
 *       "image_credit"?, "featured"?, "match_id"?, "team_id"?, "competition_id"? } ],
 *     "has_more": boolean }
 */

export const NEWS_CATEGORIES = {
  MATCH_REPORT: "Match report",
  PLAYER_SPOTLIGHT: "Player spotlight",
  TEAM_UPDATE: "Team update",
  COMPETITION: "Competition",
  INTERVIEW: "Interview",
  UPDATE: "Sports update",
} as const;
export type NewsCategory = keyof typeof NEWS_CATEGORIES;

export interface NewsItem {
  /** Stable Amigo article id. */
  id: string;
  headline: string;
  summary: string;
  category: NewsCategory;
  /** Confirmed report vs. opinion — always shown so the two are never confused. */
  kind: "report" | "opinion";
  publishedAt: string;
  /** Permanent article URL on Amigo World, with referral parameters. */
  url: string;
  imageUrl: string | null;
  imageAlt: string;
  imageCredit: string | null;
  featured: boolean;
  matchId: string | null;
  teamId: string | null;
  competitionId: string | null;
}

export interface NewsPage {
  /** "ok"; "unconfigured" (no feed yet); "unavailable" (feed down — the site carries on). */
  status: "ok" | "unconfigured" | "unavailable";
  items: NewsItem[];
  hasMore: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

/** An https URL on the expected host only (prevents broken or foreign "Read Full Story" links). */
function httpsOn(v: unknown, host: string | null): URL | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    if (host && u.host !== host) return null;
    return u;
  } catch {
    return null;
  }
}

/** Referral tagging only — no personal or device information. */
export function withReferral(u: URL): string {
  const out = new URL(u);
  out.searchParams.set("utm_source", "eksusportshub");
  out.searchParams.set("utm_medium", "referral");
  out.searchParams.set("utm_campaign", "sports_news");
  return out.toString();
}

/**
 * Validates one feed entry. Anything not explicitly published, or missing a
 * headline, summary, date or a valid article URL on Amigo World, is dropped.
 */
export function parseNewsItem(raw: unknown, articleHost: string | null): NewsItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "published") return null;
  const articleId = str(r.id, 100);
  const headline = str(r.headline, 160);
  const summary = str(r.summary, 400);
  const published = typeof r.published_at === "string" && !Number.isNaN(Date.parse(r.published_at)) ? r.published_at : null;
  const url = httpsOn(r.url, articleHost);
  if (!articleId || !headline || !summary || !published || !url) return null;
  const category = (typeof r.category === "string" && r.category in NEWS_CATEGORIES ? r.category : "UPDATE") as NewsCategory;
  const image = httpsOn(r.image_url, null);
  return {
    id: articleId,
    headline,
    summary,
    category,
    kind: r.kind === "opinion" ? "opinion" : "report",
    publishedAt: published,
    url: withReferral(url),
    imageUrl: image ? image.toString() : null,
    imageAlt: str(r.image_alt, 200) ?? "",
    imageCredit: str(r.image_credit, 120),
    featured: r.featured === true,
    matchId: id(r.match_id),
    teamId: id(r.team_id),
    competitionId: id(r.competition_id),
  };
}

export function parseNewsFeed(raw: unknown, articleHost: string | null): Omit<NewsPage, "status"> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.items) ? r.items : [];
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const x of list) {
    const item = parseNewsItem(x, articleHost);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { items, hasMore: r.has_more === true };
}
