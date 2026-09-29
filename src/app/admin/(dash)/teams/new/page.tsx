import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { TeamFields } from "@/components/admin/TeamFields";
import { btn, Card, PageTitle } from "@/components/admin/ui";
import { createTeam } from "@/lib/admin/actions/teams";
import { listFaculties, listSports } from "@/lib/admin/data/reference";

export const metadata: Metadata = { title: "New team" };

export default async function NewTeamPage() {
  const [faculties, sports] = await Promise.all([listFaculties(), listSports()]);
  return (
    <>
      <PageTitle title="New team" back={{ href: "/admin/teams", label: "Teams" }} />
      <Card>
        <ActionForm action={createTeam}>
          <TeamFields faculties={faculties} sports={sports} />
          <Submit className={`${btn.primary} mt-4`}>Create team</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
