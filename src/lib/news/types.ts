/** A published news article as the public site sees it. */
export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: string;
  pinned: boolean;
  matchId: string | null;
}

/** URL-safe slug from a title ("Civil 400L v 500L!" → "civil-400l-v-500l"). */
export function newsSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const newsHref = (slug: string) => `/news/${slug}`;
