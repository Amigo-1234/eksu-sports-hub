import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatLongDate } from "@/lib/format";
import { matchHref } from "@/lib/match";
import { NEWS_CATEGORIES } from "@/lib/news/feed";
import { getStory } from "@/lib/news/stories";

export async function generateMetadata({ params }: PageProps<"/news/[id]">): Promise<Metadata> {
  const s = getStory((await params).id);
  if (!s) return { title: "Story not found" };
  return {
    title: s.headline,
    description: s.summary,
    openGraph: { type: "article", title: s.headline, description: s.summary, publishedTime: s.publishedAt, images: [{ url: s.image.src, width: s.image.width, height: s.image.height, alt: s.image.alt }] },
    twitter: { card: "summary_large_image", title: s.headline, description: s.summary, images: [s.image.src] },
  };
}

/** A Sports News story published on EKSU Sports Hub. */
export default async function StoryPage({ params }: PageProps<"/news/[id]">) {
  const s = getStory((await params).id);
  if (!s) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-4 pt-4" aria-labelledby="story-title">
      <Link href="/news" className="text-sm font-bold text-brand-fg">← Sports News</Link>
      <header className="space-y-2">
        <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-ink-faint uppercase">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-fg">{NEWS_CATEGORIES[s.category]}</span>
          <time dateTime={s.publishedAt}>{formatLongDate(s.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{s.kind === "opinion" ? "Opinion" : "Report"}</span>
        </p>
        <h1 id="story-title" className="font-display text-2xl leading-tight font-extrabold tracking-tight sm:text-4xl">{s.headline}</h1>
        <p className="text-base text-ink-muted">{s.summary}</p>
      </header>
      <figure className="space-y-1">
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-subtle">
          <Image src={s.image.src} alt={s.image.alt} fill priority sizes="(min-width: 768px) 48rem, 100vw" className="object-cover" />
        </div>
        {s.imageCredit && <figcaption className="text-xs text-ink-faint">Photo: {s.imageCredit}</figcaption>}
      </figure>
      <div className="space-y-3 text-[15px] leading-relaxed">
        {s.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {s.matchId && (
        <Link
          href={matchHref(s.matchId)}
          className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 font-bold shadow-card hover:bg-subtle"
        >
          <span>View match details and live score</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {s.gallery.length > 0 && (
        <section aria-label="Photos" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {s.gallery.map((g) => (
            <div key={g.src} className="relative aspect-square overflow-hidden rounded-lg bg-subtle">
              <Image src={g.src} alt={g.alt} fill sizes="(min-width: 640px) 16rem, 50vw" className="object-cover" />
            </div>
          ))}
        </section>
      )}
      {s.imageCredit && s.gallery.length > 0 && <p className="text-xs text-ink-faint">Photos: {s.imageCredit}</p>}
    </article>
  );
}
