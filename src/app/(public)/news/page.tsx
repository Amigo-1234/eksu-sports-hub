import type { Metadata } from "next";
import Link from "next/link";
import { NewsHero, NewsRow, NewsTile } from "@/components/news/NewsTiles";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertIcon, NewsIcon } from "@/components/ui/icons";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/feed";
import { getNews } from "@/lib/news/source";

export const metadata: Metadata = {
  title: "Sports News",
  description: "EKSU sports news — match reports, player spotlights, team updates and competition news.",
};

/** Filter chips shown on the feed (the feed's own categories). */
const FILTERS: { key: NewsCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "MATCH_REPORT", label: "Match reports" },
  { key: "PLAYER_SPOTLIGHT", label: "Player updates" },
  { key: "TEAM_UPDATE", label: "Team updates" },
  { key: "COMPETITION", label: "Competitions" },
  { key: "INTERVIEW", label: "Interviews" },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Sports News: lead story, latest stories and category filters; newest first, 12 per page. */
export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  const rawCat = one(sp.category);
  const category = rawCat && rawCat in NEWS_CATEGORIES ? (rawCat as NewsCategory) : null;
  const { status, items: all, hasMore } = await getNews({ page });
  const items = category ? all.filter((i) => i.category === category) : all;

  const lead = page === 1 && !category ? (items.find((i) => i.featured) ?? items[0]) : undefined;
  const rest = items.filter((i) => i !== lead);
  const [secondary, list] = [rest.slice(0, 2), rest.slice(2)];
  const href = (p: number, c: NewsCategory | null = category) => {
    const q = new URLSearchParams();
    if (c) q.set("category", c);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/news?${s}` : "/news";
  };

  return (
    <div className="space-y-5 pt-4">
      <header className="flex items-end justify-between gap-3 border-b-[3px] border-ink pb-2">
        <div>
          <h1 className="flex items-center gap-2 font-display text-[34px] leading-none font-extrabold tracking-[0.01em] uppercase sm:text-[42px]">
            <NewsIcon size={28} className="text-brand-fg" />
            News
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Match reports, player updates and competition news from EKSU sport.</p>
        </div>
      </header>

      <nav aria-label="News categories" className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none]">
        <ul className="flex w-max gap-2">
          {FILTERS.map((f) => {
            const active = (f.key === "ALL" && !category) || f.key === category;
            return (
              <li key={f.key}>
                <Link
                  href={href(1, f.key === "ALL" ? null : f.key)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                    active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {items.length === 0 ? (
        status === "unavailable" ? (
          <EmptyState
            icon={<AlertIcon size={18} />}
            title="News is temporarily unavailable"
            description="Live scores, fixtures and results are not affected. Please check back shortly."
            action={{ href: "/", label: "Back to scores" }}
          />
        ) : (
          <EmptyState
            icon={<NewsIcon size={18} />}
            title={category ? `No ${FILTERS.find((f) => f.key === category)?.label.toLowerCase()} yet` : page > 1 ? "No more stories" : "No stories published yet"}
            description="Match reports, player updates and competition news will appear here."
            action={{ href: "/news", label: "Latest news" }}
          />
        )
      ) : (
        <>
          {lead && <NewsHero item={lead} />}
          {secondary.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {secondary.map((i) => (
                <NewsTile key={i.id} item={i} />
              ))}
            </div>
          )}
          {list.length > 0 && (
            <section aria-labelledby="latest-news">
              <h2 id="latest-news" className="font-display text-xl font-extrabold tracking-wide uppercase">
                Latest
              </h2>
              <div className="divide-y divide-line">
                {list.map((i) => (
                  <NewsRow key={i.id} item={i} />
                ))}
              </div>
            </section>
          )}
          {(page > 1 || hasMore) && (
            <nav aria-label="News pages" className="flex justify-between">
              {page > 1 ? (
                <Link href={href(page - 1)} className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-bold hover:bg-subtle">
                  Newer
                </Link>
              ) : (
                <span />
              )}
              {hasMore && (
                <Link href={href(page + 1)} className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-bold hover:bg-subtle">
                  Older
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
