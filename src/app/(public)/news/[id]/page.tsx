import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import crest from "../../../../../public/brand/eksu-crest-192.png";
import { NewsShare } from "@/components/news/NewsShare";
import { CategoryTag, NewsTile } from "@/components/news/NewsTiles";
import { BackLink } from "@/components/ui/BackLink";
import { formatLongDate } from "@/lib/format";
import { matchHref } from "@/lib/match";
import { publishedStories, getStory } from "@/lib/news/stories";
import { storyItem } from "@/lib/news/source";
import { siteOrigin } from "@/lib/site-url";

export async function generateMetadata({ params }: PageProps<"/news/[id]">): Promise<Metadata> {
  const s = getStory((await params).id);
  if (!s) return { title: "Story not found" };
  return {
    title: s.headline,
    description: s.summary,
    openGraph: {
      type: "article",
      title: s.headline,
      description: s.summary,
      publishedTime: s.publishedAt,
      images: [{ url: s.image.src, width: s.image.width, height: s.image.height, alt: s.image.alt }],
    },
    twitter: { card: "summary_large_image", title: s.headline, description: s.summary, images: [s.image.src] },
  };
}

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));

/** A Sports News story published on EKSU Sports Hub. */
export default async function StoryPage({ params }: PageProps<"/news/[id]">) {
  const { id } = await params;
  const s = getStory(id);
  if (!s) notFound();

  const url = `${await siteOrigin()}/news/${s.id}`;
  const words = s.body.join(" ").split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  const related = publishedStories()
    .filter((r) => r.id !== s.id)
    .sort((a, b) => Number(b.matchId === s.matchId && !!s.matchId) - Number(a.matchId === s.matchId && !!s.matchId))
    .slice(0, 3)
    .map(storyItem);

  return (
    <div className="pt-2 sm:pt-4">
      <BackLink fallbackHref="/news" label="News" />
      <article className="mx-auto max-w-3xl" aria-labelledby="story-title">
        <figure className="-mx-3 sm:mx-0">
          <div className="relative aspect-[4/3] overflow-hidden bg-subtle sm:aspect-[16/9] sm:rounded-card">
            <Image src={s.image.src} alt={s.image.alt} fill priority sizes="(min-width: 768px) 48rem, 100vw" className="object-cover" />
          </div>
          <figcaption className="px-3 pt-2 text-xs leading-snug text-ink-faint sm:px-0">
            {s.image.alt}
            {s.imageCredit && <span className="text-ink-muted"> · Photo: {s.imageCredit}</span>}
          </figcaption>
        </figure>

        <header className="mt-5 space-y-3">
          <CategoryTag category={s.category} />
          <h1 id="story-title" className="font-display text-[32px] leading-[1.02] font-extrabold tracking-[0.003em] text-balance sm:text-[46px]">
            {s.headline}
          </h1>
          <p className="text-[17px] leading-relaxed font-medium text-ink-muted">{s.summary}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-full border border-line bg-surface">
                <Image src={crest} alt="" width={24} height={24} />
              </span>
              <span className="text-sm leading-tight">
                <span className="block font-bold">{s.author ?? "EKSU Sports Hub"}</span>
                <span className="text-ink-faint">
                  <time dateTime={s.publishedAt}>
                    {formatLongDate(s.publishedAt)} · {timeOf(s.publishedAt)}
                  </time>{" "}
                  · {minutes} min read
                </span>
              </span>
            </div>
            <NewsShare url={url} title={s.headline} />
          </div>
        </header>

        <div className="mt-5 space-y-5 text-[17px] leading-[1.75] text-ink">
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        {s.matchId && (
          <Link
            href={matchHref(s.matchId)}
            className="mt-6 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3.5 font-bold shadow-card hover:border-brand-300 hover:bg-brand-50"
          >
            <span>Match centre: details, line-ups and live score</span>
            <span aria-hidden="true" className="text-brand-fg">
              →
            </span>
          </Link>
        )}

        {s.gallery.length > 0 && (
          <section aria-labelledby="story-photos" className="mt-8">
            <h2 id="story-photos" className="mb-3 font-display text-xl font-extrabold tracking-wide uppercase">
              Photos
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {s.gallery.map((g) => (
                <figure key={g.src} className="min-w-0">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-subtle">
                    <Image src={g.src} alt={g.alt} fill sizes="(min-width: 640px) 16rem, 50vw" className="object-cover" />
                  </div>
                  <figcaption className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-faint">{g.alt}</figcaption>
                </figure>
              ))}
            </div>
            {s.imageCredit && <p className="mt-2 text-xs text-ink-faint">Photos: {s.imageCredit}</p>}
          </section>
        )}
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-news" className="mx-auto mt-10 max-w-5xl">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="related-news" className="font-display text-2xl font-extrabold tracking-wide uppercase">
              More news
            </h2>
            <Link href="/news" className="text-sm font-bold text-brand-fg hover:underline">
              All news
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <NewsTile key={r.id} item={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
