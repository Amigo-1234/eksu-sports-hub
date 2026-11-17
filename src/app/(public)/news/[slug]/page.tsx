import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchCardList } from "@/components/match/MatchList";
import { NewsBody } from "@/components/news/NewsBody";
import { ShareButton } from "@/components/news/ShareButton";
import { BackLink } from "@/components/ui/BackLink";
import { getMatch, getNow } from "@/lib/data";
import { formatLongDate, formatTime } from "@/lib/format";
import { getNews } from "@/lib/news/public";

export async function generateMetadata({ params }: PageProps<"/news/[slug]">): Promise<Metadata> {
  const post = await getNews((await params).slug);
  if (!post) return { title: "News" };
  return {
    title: post.title,
    description: post.summary || undefined,
    openGraph: { title: post.title, description: post.summary || undefined, type: "article", publishedTime: post.publishedAt },
  };
}

export default async function NewsArticlePage({ params }: PageProps<"/news/[slug]">) {
  const post = await getNews((await params).slug);
  if (!post) notFound();
  const [match, now] = await Promise.all([post.matchId ? getMatch(post.matchId).catch(() => null) : null, getNow()]);

  return (
    <article className="mx-auto max-w-2xl pt-2 sm:pt-4">
      <BackLink />
      <header className="relative mt-1 overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-700" aria-hidden="true" />
        <p className="text-[11px] font-bold tracking-[0.1em] text-ink-faint uppercase">
          <Link href="/news" className="text-brand-fg hover:underline">News</Link>
          <span aria-hidden="true"> · </span>
          <time dateTime={post.publishedAt}>
            {formatLongDate(post.publishedAt)}, {formatTime(post.publishedAt)}
          </time>
        </p>
        <h1 className="mt-2 font-display text-[28px] leading-[1.05] font-extrabold tracking-[0.01em] uppercase sm:text-[36px]">{post.title}</h1>
        {post.summary && <p className="mt-2 text-[17px] leading-snug text-ink-muted">{post.summary}</p>}
        <div className="mt-4">
          <ShareButton title={post.title} />
        </div>
      </header>

      {match && (
        <section aria-label="Match" className="mt-4">
          <MatchCardList matches={[match]} serverNow={now} />
        </section>
      )}

      {post.body && (
        <div className="mt-5 rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
          <NewsBody body={post.body} />
        </div>
      )}

      <p className="mt-5 px-1 text-sm">
        <Link href="/news" className="font-semibold text-brand-fg hover:underline">← All news</Link>
      </p>
    </article>
  );
}
