import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { NewsFields } from "@/components/admin/NewsFields";
import { Badge, btn, Card, PageTitle } from "@/components/admin/ui";
import { deleteNews, updateNews } from "@/lib/admin/actions/news";
import { getNewsPost, newsMatchOptions } from "@/lib/admin/data/news";
import { serverNow } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Edit story" };

export default async function EditNewsPage({ params, searchParams }: PageProps<"/admin/news/[id]">) {
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const [post, matches] = await Promise.all([getNewsPost(id), newsMatchOptions()]);
  if (!post) notFound();
  const live = post.status === "PUBLISHED" && post.published_at && new Date(post.published_at).getTime() <= serverNow();
  return (
    <>
      <PageTitle
        title={post.title}
        back={{ href: "/admin/news", label: "News" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {post.status === "DRAFT" ? <Badge tone="muted">Draft</Badge> : live ? <Badge tone="ok">Published</Badge> : <Badge tone="warn">Scheduled</Badge>}
            {live && (
              <Link href={`/news/${post.slug}`} target="_blank" className="font-semibold text-brand-700 underline">
                View on site
              </Link>
            )}
          </span>
        }
      />
      {saved && <p className="mb-4 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">Saved.</p>}
      <Card>
        <ActionForm action={updateNews}>
          <NewsFields post={post} matches={matches} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Submit className={btn.primary} name="intent" value="publish" pendingLabel="Saving…">
              {post.status === "PUBLISHED" ? "Save" : "Publish"}
            </Submit>
            <Submit className={btn.secondary} name="intent" value="draft">
              {post.status === "PUBLISHED" ? "Unpublish (save as draft)" : "Save draft"}
            </Submit>
          </div>
        </ActionForm>
      </Card>
      <div className="mt-4">
        <ConfirmAction action={deleteNews} hidden={{ id: post.id }} trigger="Delete story" triggerClass={btn.small} title={`Delete “${post.title}”?`} confirmLabel="Delete story" />
      </div>
    </>
  );
}
