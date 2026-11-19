import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { FanBar } from "@/components/fan/FanBar";
import { formatLongDate } from "@/lib/format";
import { NEWS_CATEGORIES, type NewsItem } from "@/lib/news/feed";

/*
 * Editorial news tiles: a featured hero and compact list rows with thumbnails.
 * Stories published on EKSU Sports Hub open their page here; external
 * (Amigo World) items open that exact article in a new tab.
 */

const isLocal = (i: NewsItem) => i.url.startsWith("/");

export function CategoryTag({ category, tone = "brand" }: { category: NewsItem["category"]; tone?: "brand" | "onImage" }) {
  return (
    <span
      className={`inline-flex w-fit items-center self-start rounded-sm px-1.5 py-0.5 font-display text-[12px] leading-none font-bold tracking-[0.08em] uppercase ${
        tone === "onImage" ? "bg-accent-400 text-ink" : "bg-brand-700 text-white"
      }`}
    >
      {NEWS_CATEGORIES[category]}
    </span>
  );
}

function Media({ item, sizes, priority }: { item: NewsItem; sizes: string; priority?: boolean }) {
  if (!item.imageUrl) return <span className="absolute inset-0 bg-gradient-to-br from-brand-700 to-brand-500" aria-hidden="true" />;
  if (isLocal(item)) return <Image src={item.imageUrl} alt={item.imageAlt} fill priority={priority} sizes={sizes} className="object-cover" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, pre-sized images from Amigo World
    <img src={item.imageUrl} alt={item.imageAlt} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 size-full object-cover" />
  );
}

function StoryLink({ item, className, children }: { item: NewsItem; className: string; children: ReactNode }) {
  return isLocal(item) ? (
    <Link href={item.url} className={className}>
      {children}
    </Link>
  ) : (
    <a href={item.url} target="_blank" rel="noopener" className={className}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Lead story: full-width image with the headline set over a dark gradient. */
export function NewsHero({ item }: { item: NewsItem }) {
  if (!isLocal(item)) return <HeroLink item={item} className="rounded-card shadow-card" />;
  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <HeroLink item={item} />
      <FanBar id={item.id} href={item.url} />
    </article>
  );
}

function HeroLink({ item, className = "" }: { item: NewsItem; className?: string }) {
  return (
    <StoryLink
      item={item}
      className={`group relative block aspect-[4/3] overflow-hidden bg-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 sm:aspect-[16/8] ${className}`}
    >
      <Media item={item} sizes="(min-width: 1280px) 80rem, 100vw" priority />
      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" aria-hidden="true" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white sm:p-6">
        <span className="flex items-center gap-2">
          <CategoryTag category={item.category} tone="onImage" />
          <time dateTime={item.publishedAt} className="text-xs font-semibold text-white/80">
            {formatLongDate(item.publishedAt)}
          </time>
        </span>
        <span className="font-display text-[26px] leading-[1.02] font-extrabold tracking-[0.005em] text-balance group-hover:underline sm:text-[38px]">
          {item.headline}
        </span>
        <span className="line-clamp-2 max-w-2xl text-sm text-white/85 sm:text-[15px]">{item.summary}</span>
      </span>
    </StoryLink>
  );
}

/** Compact row: thumbnail, category, headline, date. */
export function NewsRow({ item }: { item: NewsItem }) {
  return (
    <StoryLink item={item} className="group flex gap-3 py-3 focus-visible:outline-2 focus-visible:outline-brand-600">
      <span className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg bg-subtle sm:w-36">
        <Media item={item} sizes="(min-width: 640px) 9rem, 7rem" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <CategoryTag category={item.category} />
        </span>
        <span className="line-clamp-3 font-display text-[18px] leading-[1.1] font-bold text-ink group-hover:text-brand-fg sm:text-[20px]">
          {item.headline}
        </span>
        <time dateTime={item.publishedAt} className="mt-auto text-xs text-ink-faint">
          {formatLongDate(item.publishedAt)}
        </time>
      </span>
    </StoryLink>
  );
}

/** Card for grids (related news): image on top, category, headline, date. */
export function NewsTile({ item }: { item: NewsItem }) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <StoryLink item={item} className="group flex flex-1 flex-col">
        <span className="relative aspect-[16/10] bg-subtle">
          <Media item={item} sizes="(min-width: 640px) 33vw, 100vw" />
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-3">
          <CategoryTag category={item.category} />
          <span className="line-clamp-3 font-display text-[18px] leading-[1.1] font-bold group-hover:text-brand-fg">{item.headline}</span>
          <time dateTime={item.publishedAt} className="mt-auto pt-1 text-xs text-ink-faint">
            {formatLongDate(item.publishedAt)}
          </time>
        </span>
      </StoryLink>
      {isLocal(item) && <FanBar id={item.id} href={item.url} />}
    </article>
  );
}
