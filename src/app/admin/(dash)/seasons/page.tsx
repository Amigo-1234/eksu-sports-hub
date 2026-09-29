import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { Badge, btn, Card, Empty, Field, inputCls, PageTitle } from "@/components/admin/ui";
import { saveSeason, setCurrentSeason, setSeasonArchived } from "@/lib/admin/actions/reference";
import { listSeasons } from "@/lib/admin/data/reference";
import { formatDateOnly } from "@/lib/admin/time";
import type { Season } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Seasons" };

function SeasonFields({ s }: { s?: Season }) {
  const sc = s?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field scope={sc} label="Name" hint="e.g. 2026/27">
        <input name="name" required maxLength={60} defaultValue={s?.name} className={inputCls} />
      </Field>
      <Field scope={sc} label="Starts on">
        <input type="date" name="starts_on" required defaultValue={s?.starts_on} className={inputCls} />
      </Field>
      <Field scope={sc} label="Ends on">
        <input type="date" name="ends_on" required defaultValue={s?.ends_on} className={inputCls} />
      </Field>
    </div>
  );
}

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  return (
    <>
      <PageTitle title="Seasons" description="Competitions and squads belong to a season. Seasons are archived, never deleted." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="All seasons">
          {seasons.length === 0 ? (
            <Empty title="No seasons yet">Create the first season to start adding competitions.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {seasons.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-bold">
                        {s.name}
                        {s.is_current && <Badge tone="ok">Current</Badge>}
                        {s.archived_at && <Badge tone="muted">Archived</Badge>}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {formatDateOnly(s.starts_on)} – {formatDateOnly(s.ends_on)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!s.is_current && !s.archived_at && (
                        <ConfirmAction
                          action={setCurrentSeason}
                          hidden={{ id: s.id }}
                          trigger="Make current"
                          triggerClass={btn.small}
                          tone="primary"
                          title={`Make ${s.name} the current season?`}
                          body="The public site and new squads default to the current season."
                          confirmLabel="Make current"
                        />
                      )}
                      {!s.is_current && (
                        <ConfirmAction
                          action={setSeasonArchived}
                          hidden={{ id: s.id, archive: s.archived_at ? "0" : "1" }}
                          trigger={s.archived_at ? "Restore" : "Archive"}
                          triggerClass={btn.small}
                          tone={s.archived_at ? "primary" : "danger"}
                          title={s.archived_at ? `Restore ${s.name}?` : `Archive ${s.name}?`}
                          body={s.archived_at ? undefined : "Archived seasons stay in the record but cannot be made current."}
                          confirmLabel={s.archived_at ? "Restore" : "Archive"}
                        />
                      )}
                    </div>
                  </div>
                  <Disclosure summary="Edit" className="mt-1">
                    <ActionForm action={saveSeason}>
                      <SeasonFields s={s} />
                      <Submit className={`${btn.primary} mt-3`}>Save season</Submit>
                    </ActionForm>
                  </Disclosure>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="New season">
          <ActionForm action={saveSeason} resetOnSuccess>
            <SeasonFields />
            <Submit className={`${btn.primary} mt-3 w-full`}>Create season</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
