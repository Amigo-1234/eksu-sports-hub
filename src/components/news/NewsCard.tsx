import Image from "next/image";
import Link from "next/link";
import { NEWS_CATEGORIES, type NewsItem } from "@/lib/news/feed";
import { formatLongDate } from "@/lib/format";

/**
 * A Sports News preview. Stories published on EKSU Sports Hub open their full
 * page here; Amigo World articles (once launched) open that exact article.
 */
export function NewsCard({ item, lead = false }: { item: NewsItem; lead?: boolean }) {
  const local = item.url.startsWith("/");
  return (
    <article
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card ${
        lead ? "sm:col-span-2 sm:flex-row" : ""
      }`}
    >
      <div className={`relative aspect-[16/9] w-full shrink-0 bg-subtle ${lead ? "sm:aspect-auto sm:w-1/2" : ""}`}>
        {item.imageUrl && local && (
          <Image src={item.imageUrl} alt={item.imageAlt} fill priority={lead} sizes={lead ? "(min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} className="object-cover" />
        )}
        {item.imageUrl && !local && (
          // eslint-disable-next-line @next/next/no-img-element -- external, pre-sized images from Amigo World
          <img
            src={item.imageUrl}
            alt={item.imageAlt}
            loading={lead ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        )}
        <span className="absolute top-2 left-2 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-bold text-ink shadow-card">
          {NEWS_CATEGORIES[item.category]}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
        <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-ink-faint uppercase">
          <time dateTime={item.publishedAt}>{formatLongDate(item.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span className={item.kind === "opinion" ? "text-accent-700" : ""}>{item.kind === "opinion" ? "Opinion" : "Report"}</span>
        </p>
        <h3 className={`font-display leading-tight font-bold ${lead ? "text-xl sm:text-2xl" : "text-base"}`}>{item.headline}</h3>
        <p className="line-clamp-3 text-sm text-ink-muted">{item.summary}</p>
        {item.imageCredit && <p className="text-[11px] text-ink-faint">Photo: {item.imageCredit}</p>}
        {local ? (
          <Link
            href={item.url}
            className="mt-auto inline-flex min-h-10 items-center justify-center gap-1 self-start rounded-lg bg-brand-700 px-3 text-sm font-bold text-white hover:bg-brand-800"
          >
            Read full story
            <span className="sr-only">: {item.headline}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <a
            href={item.url}
            target="_blank"
            rel="noopener"
            className="mt-auto inline-flex min-h-10 items-center justify-center gap-1 self-start rounded-lg bg-brand-700 px-3 text-sm font-bold text-white hover:bg-brand-800"
          >
            Read Full Story on Amigo World
            <span className="sr-only"> (opens in a new tab)</span>
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </article>
  );
}
