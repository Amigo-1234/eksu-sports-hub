import Link from "next/link";
import { ChevronRightIcon, NewsIcon } from "@/components/ui/icons";
import { formatShortDate } from "@/lib/format";
import { newsHref, type NewsPost } from "@/lib/news/types";

/** Compact news list (home page, news index). */
export function NewsList({ posts, featureFirst = false }: { posts: NewsPost[]; featureFirst?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {posts.map((p, i) => {
        const feature = featureFirst && i === 0;
        return (
          <li key={p.id}>
            <Link href={newsHref(p.slug)} className="group flex gap-3 px-3 py-3 transition-colors hover:bg-subtle sm:px-4">
              <span
                className={`grid shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-fg ${feature ? "size-12" : "size-10"}`}
                aria-hidden="true"
              >
                <NewsIcon size={feature ? 24 : 20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-ink-faint uppercase">
                  {p.pinned && <span className="rounded-sm bg-accent-400 px-1.5 py-px text-[10px] text-brand-900">Pinned</span>}
                  <time dateTime={p.publishedAt}>{formatShortDate(p.publishedAt)}</time>
                </span>
                <span className={`mt-0.5 block leading-snug font-bold text-ink group-hover:underline ${feature ? "text-[18px]" : "text-[15px]"}`}>
                  {p.title}
                </span>
                {p.summary && <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-muted">{p.summary}</span>}
              </span>
              <ChevronRightIcon size={16} className="mt-1 shrink-0 self-center text-ink-faint" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
