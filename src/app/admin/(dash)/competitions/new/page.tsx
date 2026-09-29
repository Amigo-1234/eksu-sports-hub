import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CompetitionFields } from "@/components/admin/CompetitionFields";
import { btn, Card, Empty, PageTitle } from "@/components/admin/ui";
import { createCompetition } from "@/lib/admin/actions/competitions";
import { listSeasons, listSports } from "@/lib/admin/data/reference";
import Link from "next/link";

export const metadata: Metadata = { title: "New competition" };

export default async function NewCompetitionPage() {
  const [seasons, sports] = await Promise.all([listSeasons(), listSports()]);
  const usable = seasons.filter((s) => !s.archived_at);
  return (
    <>
      <PageTitle title="New competition" back={{ href: "/admin/competitions", label: "Competitions" }} description="Created as a draft with one stage. Add teams, stages and groups next, then activate it." />
      <Card>
        {usable.length === 0 ? (
          <Empty title="Create a season first" action={<Link href="/admin/seasons" className={btn.primary}>Seasons</Link>} />
        ) : (
          <ActionForm action={createCompetition}>
            <CompetitionFields seasons={usable} sports={sports} />
            <Submit className={`${btn.primary} mt-4`}>Create competition</Submit>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
