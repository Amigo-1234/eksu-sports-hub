import type { Metadata } from "next";
import { NewsList } from "@/components/news/NewsList";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewsIcon } from "@/components/ui/icons";
import { listNews } from "@/lib/news/public";

export const metadata: Metadata = {
  title: "News",
  description: "Announcements, previews and match reports from EKSU sport.",
};

export default async function NewsPage() {
  const posts = await listNews(50);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="News" subtitle="Announcements, previews and match reports" />
      {posts.length > 0 ? (
        <NewsList posts={posts} featureFirst />
      ) : (
        <EmptyState icon={<NewsIcon size={18} />} title="No news yet" description="Announcements and match reports will appear here." />
      )}
    </div>
  );
}
