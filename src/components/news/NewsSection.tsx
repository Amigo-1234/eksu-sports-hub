import { SectionHeader } from "@/components/ui/SectionHeader";
import { getNews } from "@/lib/news/source";
import { NewsHero, NewsRow } from "./NewsTiles";

/**
 * Homepage Sports News: the featured story plus the latest few. Renders
 * nothing until published stories exist (or while Amigo World is
 * unavailable), so live scores, fixtures and results are never pushed aside.
 */
export async function NewsSection({ limit = 4 }: { limit?: number }) {
  const { items } = await getNews({ limit: limit + 2 });
  if (items.length === 0) return null;
  const lead = items.find((i) => i.featured) ?? items[0];
  const rest = items.filter((i) => i.id !== lead.id).slice(0, limit - 1);
  return (
    <section aria-labelledby="sports-news">
      <SectionHeader id="sports-news" title="Sports News" href="/news" linkLabel="All news" />
      <NewsHero item={lead} />
      {rest.length > 0 && (
        <div className="mt-1 divide-y divide-line">
          {rest.map((i) => (
            <NewsRow key={i.id} item={i} />
          ))}
        </div>
      )}
    </section>
  );
}
