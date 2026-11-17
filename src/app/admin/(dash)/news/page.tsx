import type { Metadata } from "next";
import Link from "next/link";
import { Badge, btn, Card, Empty, PageTitle } from "@/components/admin/ui";
import { listNewsPosts } from "@/lib/admin/data/news";
import { formatWatDateTime, serverNow } from "@/lib/admin/time";

export const metadata: Metadata = { title: "News" };

export default async function AdminNewsPage() {
  const posts = await listNewsPosts();
  const now = serverNow();
  return (
    <>
      <PageTitle
        title="News"
        description="Announcements, previews and match reports shown on the public site."
        actions={<Link href="/admin/news/new" className={btn.primary}>New story</Link>}
      />
      <Card>
        {posts.length === 0 ? (
          <Empty title="No stories yet" action={<Link href="/admin/news/new" className={btn.primary}>Write the first story</Link>} />
        ) : (
          <ul className="divide-y divide-line">
            {posts.map((p) => {
              const scheduled = p.status === "PUBLISHED" && p.published_at && new Date(p.published_at).getTime() > now;
              return (
                <li key={p.id}>
                  <Link href={`/admin/news/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-subtle">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold break-words">{p.title}</span>
                      <span className="block text-sm text-ink-muted">
                        {p.published_at ? formatWatDateTime(p.published_at) : "Not published"} · /news/{p.slug}
                      </span>
                    </span>
                    {p.pinned && <Badge tone="brand">Pinned</Badge>}
                    {p.status === "DRAFT" ? <Badge tone="muted">Draft</Badge> : scheduled ? <Badge tone="warn">Scheduled</Badge> : <Badge tone="ok">Published</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
