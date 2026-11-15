import type { Metadata } from "next";
import Link from "next/link";
import { NewsCard } from "@/components/news/NewsCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertIcon, ResultsIcon } from "@/components/ui/icons";
import { getNews } from "@/lib/news/source";

export const metadata: Metadata = {
  title: "Sports News",
  description: "EKSU sports news — match reports, player spotlights and team updates.",
};

/** Published Sports News previews, newest first, 12 per page. */
export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const raw = (await searchParams).page;
  const page = Math.max(1, Number.parseInt(Array.isArray(raw) ? raw[0] : (raw ?? "1"), 10) || 1);
  const { status, items, hasMore } = await getNews({ page });

  return (
    <div className="space-y-4 pt-4">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Sports News</h1>
        <p className="text-sm text-ink-muted">Match reports, player spotlights and team updates.</p>
      </header>
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
            icon={<ResultsIcon size={18} />}
            title={page > 1 ? "No more stories" : "No stories published yet"}
            description="Match reports, player spotlights and team updates will appear here."
            action={{ href: page > 1 ? "/news" : "/", label: page > 1 ? "Latest news" : "Back to scores" }}
          />
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => (
              <NewsCard key={i.id} item={i} />
            ))}
          </div>
          {(page > 1 || hasMore) && (
            <nav aria-label="News pages" className="flex justify-between">
              {page > 1 ? <Link href={`/news?page=${page - 1}`} className="text-sm font-bold text-brand-fg">← Newer</Link> : <span />}
              {hasMore && <Link href={`/news?page=${page + 1}`} className="text-sm font-bold text-brand-fg">Older →</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
