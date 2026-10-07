import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CompetitionFields, FORMAT_LABEL } from "@/components/admin/CompetitionFields";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { Badge, btn, Card, Check, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import {
  addEntries,
  addGroup,
  deleteGroup,
  deleteStage,
  removeEntry,
  saveStage,
  setCompetitionStatus,
  updateCompetition,
  updateEntry,
} from "@/lib/admin/actions/competitions";
import { MatchLengthForm } from "@/components/admin/MatchLengthForm";
import { getCompetition } from "@/lib/admin/data/competitions";
import { listSeasons, listSports } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";
import type { CompetitionDetail } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Competition" };

function PlacementSelect({ c, value, name = "placement" }: { c: CompetitionDetail; value?: string; name?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={selectCls} aria-label="Stage and group">
      <option value="">No stage</option>
      {c.stages.map((s) => [
        <option key={s.id} value={`${s.id}:`}>
          {s.name}
        </option>,
        ...s.groups.map((g) => (
          <option key={g.id} value={`${s.id}:${g.id}`}>
            {s.name} — {g.name}
          </option>
        )),
      ])}
    </select>
  );
}

export default async function CompetitionPage({ params, searchParams }: PageProps<"/admin/competitions/[id]">) {
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const [c, seasons, sports, teams] = await Promise.all([getCompetition(id), listSeasons(), listSports(), listTeamRefs()]);
  if (!c) notFound();
  const entered = new Set(c.entries.map((e) => e.team.id));
  const available = teams.filter((t) => t.active && !entered.has(t.id));
  const nextOrder = Math.max(0, ...c.stages.map((s) => s.stage_order)) + 1;
  const statusTone = { DRAFT: "warn", ACTIVE: "ok", ARCHIVED: "muted" } as const;

  return (
    <>
      <PageTitle
        title={c.name}
        back={{ href: "/admin/competitions", label: "Competitions" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[c.status]}>{c.status.toLowerCase()}</Badge>
            {FORMAT_LABEL[c.format]} · {c.entries.length} teams · {c.match_count} fixtures
          </span>
        }
        actions={
          <>
            <Link href={`/admin/matches?competition=${c.id}`} className={btn.secondary}>
              Fixtures
            </Link>
            <Link href={`/admin/matches/new?competition=${c.id}`} className={btn.secondary}>
              New fixture
            </Link>
            <Link href={`/admin/standings?competition=${c.id}`} className={btn.secondary}>
              Standings
            </Link>
          </>
        }
      />
      {created && <p className="mb-4 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">Competition created as a draft. Enter teams, then activate it.</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card title="Status" description="Only active competitions appear in match-day warnings. Archived competitions accept no new fixtures.">
            <div className="flex flex-wrap gap-2">
              {c.status !== "ACTIVE" && (
                <ConfirmAction
                  action={setCompetitionStatus}
                  hidden={{ id: c.id, status: "ACTIVE" }}
                  trigger="Activate"
                  triggerClass={btn.primary}
                  tone="primary"
                  title={`Activate ${c.short_name}?`}
                  body={c.entries.length < 2 ? "Warning: fewer than two teams are entered." : "The competition becomes active for fixtures and operations."}
                  confirmLabel="Activate"
                />
              )}
              {c.status === "ACTIVE" && (
                <ConfirmAction action={setCompetitionStatus} hidden={{ id: c.id, status: "DRAFT" }} trigger="Deactivate (back to draft)" title="Move back to draft?" confirmLabel="Deactivate" tone="primary" />
              )}
              {c.status !== "ARCHIVED" && (
                <ConfirmAction
                  action={setCompetitionStatus}
                  hidden={{ id: c.id, status: "ARCHIVED" }}
                  trigger="Archive"
                  title={`Archive ${c.short_name}?`}
                  body="Results and tables are kept. No new fixtures can be created in it."
                  confirmLabel="Archive"
                  typeToConfirm="ARCHIVE"
                />
              )}
            </div>
          </Card>

          <Card title="Teams entered" id="entries">
            {c.entries.length === 0 ? (
              <Empty title="No teams entered" />
            ) : (
              <ul className="divide-y divide-line">
                {c.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-full min-w-0 font-semibold break-words">
                      {e.team.name} <span className="text-xs text-ink-muted">{e.team.code}</span>
                    </span>
                    <ActionForm action={updateEntry} hideMessage={false} className="flex min-w-0 flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="competition_id" value={c.id} />
                      <div className="w-52 max-w-full">
                        <PlacementSelect c={c} value={e.stage_id ? `${e.stage_id}:${e.group_id ?? ""}` : ""} />
                      </div>
                      <Submit className={btn.small}>Save</Submit>
                    </ActionForm>
                    <ConfirmAction
                      action={removeEntry}
                      hidden={{ id: e.id }}
                      trigger="Withdraw"
                      triggerClass={btn.small}
                      title={`Withdraw ${e.team.name}?`}
                      body="Only possible while the team has no fixtures in this competition."
                      confirmLabel="Withdraw team"
                    />
                  </li>
                ))}
              </ul>
            )}
            <Disclosure summary="Enter teams" className="mt-3">
              {available.length === 0 ? (
                <p className="text-sm text-ink-muted">Every active team is already entered.</p>
              ) : (
                <ActionForm action={addEntries} resetOnSuccess>
                  <input type="hidden" name="competition_id" value={c.id} />
                  <fieldset>
                    <legend className="mb-1 text-sm font-bold">Teams</legend>
                    <div className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                      {available.map((t) => (
                        <label key={t.id} className="flex min-h-10 items-center gap-2 rounded px-1 text-sm hover:bg-subtle">
                          <input type="checkbox" name="team_id" value={t.id} className="size-5 accent-brand-700" />
                          {t.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Stage / group" className="mt-3">
                    <PlacementSelect c={c} value={c.stages[0] ? `${c.stages[0].id}:` : ""} />
                  </Field>
                  <Submit className={`${btn.primary} mt-3`}>Enter selected teams</Submit>
                </ActionForm>
              )}
            </Disclosure>
          </Card>

          <Card title="Stages & groups" id="stages" description="A stage with fixtures, teams or groups cannot be removed.">
            <ul className="space-y-3">
              {c.stages.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      {s.stage_order}. {s.name} {!s.has_table && <Badge tone="muted">No table</Badge>}
                    </p>
                    <ConfirmAction action={deleteStage} hidden={{ id: s.id }} trigger="Remove" triggerClass={btn.small} title={`Remove stage ${s.name}?`} confirmLabel="Remove stage" />
                  </div>
                  <Disclosure summary="Edit stage">
                    <ActionForm action={saveStage} className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                      <input type="hidden" name="id" value={s.id} />
                      <Field scope={s.id} label="Name">
                        <input name="name" required maxLength={60} defaultValue={s.name} className={inputCls} />
                      </Field>
                      <Field scope={s.id} label="Order">
                        <input type="number" name="stage_order" min={1} max={20} required defaultValue={s.stage_order} className={inputCls} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Check name="has_table" label="Has a league table" defaultChecked={s.has_table} />
                      </div>
                      <Submit className={`${btn.primary} sm:justify-self-start`}>Save stage</Submit>
                    </ActionForm>
                  </Disclosure>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {s.groups.map((g) => (
                      <span key={g.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-subtle py-0.5 pr-0.5 pl-2 text-sm">
                        {g.name}
                        <ConfirmAction
                          action={deleteGroup}
                          hidden={{ id: g.id }}
                          trigger={<span aria-label={`Remove group ${g.name}`}>×</span>}
                          triggerClass="grid size-7 place-items-center rounded text-ink-muted hover:bg-line"
                          title={`Remove ${g.name}?`}
                          body="Only possible while no teams or fixtures are in the group."
                          confirmLabel="Remove group"
                        />
                      </span>
                    ))}
                    <ActionForm action={addGroup} resetOnSuccess className="flex items-center gap-1">
                      <input type="hidden" name="stage_id" value={s.id} />
                      <input name="name" required maxLength={40} placeholder="New group" aria-label={`New group in ${s.name}`} className={`${inputCls} h-9 w-32`} />
                      <Submit className={btn.small}>Add</Submit>
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
            <Disclosure summary="Add stage" className="mt-3">
              <ActionForm action={saveStage} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                <input type="hidden" name="competition_id" value={c.id} />
                <Field scope="new-stage" label="Name">
                  <input name="name" required maxLength={60} placeholder="Semi-finals" className={inputCls} />
                </Field>
                <Field label="Order">
                  <input type="number" name="stage_order" min={1} max={20} required defaultValue={nextOrder} className={inputCls} />
                </Field>
                <div className="sm:col-span-2">
                  <Check name="has_table" label="Has a league table" defaultChecked={c.format !== "KNOCKOUT"} />
                </div>
                <Submit className={`${btn.primary} sm:justify-self-start`}>Add stage</Submit>
              </ActionForm>
            </Disclosure>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
        <Card
          title="Match length"
          id="match-length"
          description={c.matches_started ? "Locked: a match has kicked off. Started matches keep their own length." : "Applies to every match of this competition from kick-off."}
        >
          <MatchLengthForm competitionId={c.id} halfSeconds={c.half_seconds} etHalfSeconds={c.et_half_seconds} locked={Boolean(c.matches_started)} />
        </Card>
        <Card title="Settings" id="settings">
          <ActionForm action={updateCompetition}>
            <CompetitionFields c={c} seasons={seasons} sports={sports} />
            <Submit className={`${btn.primary} mt-4`}>Save settings</Submit>
          </ActionForm>
        </Card>
        </div>
      </div>
    </>
  );
}
