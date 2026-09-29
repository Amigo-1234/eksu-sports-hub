import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { FixtureFields } from "@/components/admin/FixtureFields";
import { btn, Card, Empty, PageTitle } from "@/components/admin/ui";
import { createFixture } from "@/lib/admin/actions/matches";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { listVenues } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";

export const metadata: Metadata = { title: "New fixture" };

export default async function NewFixturePage({ searchParams }: PageProps<"/admin/matches/new">) {
  const sp = await searchParams;
  const [competitions, teams, venues] = await Promise.all([listCompetitionOptions(), listTeamRefs(), listVenues()]);
  const open = competitions.filter((c) => c.status !== "ARCHIVED");
  const preset = typeof sp.competition === "string" && open.some((c) => c.id === sp.competition) ? sp.competition : undefined;
  return (
    <>
      <PageTitle title="New fixture" back={{ href: "/admin/matches", label: "Fixtures" }} />
      <Card>
        {open.length === 0 ? (
          <Empty title="Create a competition first" action={<Link href="/admin/competitions/new" className={btn.primary}>New competition</Link>} />
        ) : (
          <ActionForm action={createFixture}>
            <FixtureFields competitions={open} teams={teams} venues={venues} initial={{ competition_id: preset }} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Submit className={btn.primary} name="another" value="0">
                Create fixture
              </Submit>
              <Submit className={btn.secondary} name="another" value="1">
                Create and add another
              </Submit>
            </div>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
