import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { SquadEditor } from "@/components/admin/SquadEditor";
import { btn, Card, Empty, Field, PageTitle, selectCls } from "@/components/admin/ui";
import { createSquad } from "@/lib/admin/actions/teams";
import { getSquad } from "@/lib/admin/data/players";
import { listSeasons } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";

export const metadata: Metadata = { title: "Squads" };

/** Team → Season → Squad. Only screened, CLEARED players can be added. */
export default async function SquadsPage({ searchParams }: PageProps<"/admin/squads">) {
  const sp = await searchParams;
  const [teams, seasons] = await Promise.all([listTeamRefs(), listSeasons()]);
  const teamId = typeof sp.team === "string" && teams.some((t) => t.id === sp.team) ? sp.team : "";
  const seasonId =
    typeof sp.season === "string" && seasons.some((s) => s.id === sp.season) ? sp.season : (seasons.find((s) => s.is_current)?.id ?? seasons[0]?.id ?? "");
  const team = teams.find((t) => t.id === teamId);
  const season = seasons.find((s) => s.id === seasonId);
  const data = team && season ? await getSquad(team.id, season.id) : null;
  const scope = team && season ? `${team.short_name} ${season.name}` : "";

  return (
    <>
      <PageTitle title="Squads" description="Choose a team and season. Shirt numbers are unique within a squad; one captain per squad." />
      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3">
          <Field label="Team" className="w-64 max-w-full">
            <select name="team" defaultValue={teamId} className={selectCls} required>
              <option value="" disabled>
                Choose a team
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Season" className="w-48 max-w-full">
            <select name="season" defaultValue={seasonId} className={selectCls}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <button className={btn.secondary}>Show squad</button>
        </form>
      </Card>
      {!team || !season ? (
        <Card>
          <Empty title="Choose a team to see its squad" />
        </Card>
      ) : data?.squad ? (
        <Card
          title={`${team.name} — ${season.name}`}
          description={`${data.members.filter((m) => m.active).length} active players`}
          actions={
            <Link href={`/admin/teams/${team.id}`} className={btn.ghost}>
              Team page →
            </Link>
          }
        >
          <SquadEditor squadId={data.squad.id} members={data.members} candidates={data.candidates} scopeLabel={scope} />
        </Card>
      ) : (
        <Card title={`${team.name} — ${season.name}`}>
          <Empty title="No squad for this season">
            <ActionForm action={createSquad}>
              <input type="hidden" name="team_id" value={team.id} />
              <input type="hidden" name="season_id" value={seasonId} />
              <Submit className={`${btn.primary} mt-2`}>Create squad</Submit>
            </ActionForm>
          </Empty>
        </Card>
      )}
    </>
  );
}
