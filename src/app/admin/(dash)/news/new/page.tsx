import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { NewsFields } from "@/components/admin/NewsFields";
import { btn, Card, PageTitle } from "@/components/admin/ui";
import { createNews } from "@/lib/admin/actions/news";
import { newsMatchOptions } from "@/lib/admin/data/news";

export const metadata: Metadata = { title: "New story" };

export default async function NewNewsPage() {
  const matches = await newsMatchOptions();
  return (
    <>
      <PageTitle title="New story" back={{ href: "/admin/news", label: "News" }} />
      <Card>
        <ActionForm action={createNews}>
          <NewsFields matches={matches} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Submit className={btn.primary} name="intent" value="publish" pendingLabel="Publishing…">Publish</Submit>
            <Submit className={btn.secondary} name="intent" value="draft">Save draft</Submit>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
