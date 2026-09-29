import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { TeamFields } from "@/components/admin/TeamFields";
import { Badge, btn, Card, Field, PageTitle, selectCls } from "@/components/admin/ui";
import { createSquad, setTeamActive, updateTeam } from "@/lib/admin/actions/teams";
import { listFaculties, listSeasons, listSports } from "@/lib/admin/data/reference";
import { getTeam, listSquads } from "@/lib/admin/data/teams";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params, searchParams }: PageProps<"/admin/teams/[id]">) {
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const [team, squads, seasons, faculties, sports] = await Promise.all([getTeam(id), listSquads(id), listSeasons(), listFaculties(), listSports()]);
  if (!team) notFound();
  const missing = seasons.filter((s) => !s.archived_at && !squads.some((q) => q.season.id === s.id));
  return (
    <>
      <PageTitle
        title={team.name}
        back={{ href: "/admin/teams", label: "Teams" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {team.active ? <Badge tone="ok">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
            {team.code} · <span className="font-mono">{team.slug}</span>
          </span>
        }
        actions={
          <>
            <Link href={`/admin/matches?team=${team.id}`} className={btn.secondary}>
              Fixtures
            </Link>
            <ConfirmAction
              action={setTeamActive}
              hidden={{ id: team.id, active: team.active ? "0" : "1" }}
              trigger={team.active ? "Deactivate" : "Reactivate"}
              tone={team.active ? "danger" : "primary"}
              title={team.active ? `Deactivate ${team.name}?` : `Reactivate ${team.name}?`}
              body={team.active ? "Inactive teams cannot be entered into new competitions. Existing fixtures and results are kept." : undefined}
              confirmLabel={team.active ? "Deactivate" : "Reactivate"}
            />
          </>
        }
      />
      {created && <p className="mb-4 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">Team created. Create a squad below, then add screened players.</p>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {squads.length === 0 && (
            <Card title="Squads">
              <p className="text-sm text-ink-muted">No squads yet. Create one for a season.</p>
            </Card>
          )}
          {squads.length > 0 && (
            <Card title="Squads" description="Players are screened first, then added to a season squad.">
              <ul className="divide-y divide-line">
                {squads.map((s) => {
                  const captain = s.players.find((p) => p.is_captain);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-bold">Squad {s.season.name}</span>
                        <span className="text-xs text-ink-muted">
                          {s.players.length} active player{s.players.length === 1 ? "" : "s"}
                          {captain ? ` · captain No. ${captain.shirt_number}` : ""}
                        </span>
                      </span>
                      <Link href={`/admin/squads?team=${team.id}&season=${s.season.id}`} className={btn.small}>
                        Manage squad
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {missing.length > 0 && (
            <Card title="New squad">
              <ActionForm action={createSquad} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="team_id" value={team.id} />
                <Field label="Season" className="w-56 max-w-full">
                  <select name="season_id" className={selectCls}>
                    {missing.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Submit className={btn.primary}>Create squad</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
        <Card title="Team details">
          <ActionForm action={updateTeam}>
            <TeamFields t={team} faculties={faculties} sports={sports} />
            <Submit className={`${btn.primary} mt-4`}>Save team</Submit>
          </ActionForm>
          <p className="mt-4 text-xs text-ink-muted">Crest upload is not available yet: file storage is not set up for this project.</p>
        </Card>
      </div>
    </>
  );
}
