import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { btn, Card, Empty, Field, inputCls, PageTitle } from "@/components/admin/ui";
import { deleteVenue, saveVenue } from "@/lib/admin/actions/reference";
import { listVenues } from "@/lib/admin/data/reference";
import type { Venue } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Venues" };

function VenueFields({ v }: { v?: Venue }) {
  const sc = v?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {v && <input type="hidden" name="id" value={v.id} />}
      <Field scope={sc} label="Name">
        <input name="name" required maxLength={120} defaultValue={v?.name} placeholder="University Sports Complex — Main Pitch" className={inputCls} />
      </Field>
      <Field scope={sc} label="Short name" hint="Shown in fixture lists">
        <input name="short_name" required maxLength={40} defaultValue={v?.short_name} className={inputCls} />
      </Field>
      <Field scope={sc} label="Notes" hint="Directions, access, pitch notes" className="sm:col-span-2">
        <textarea name="notes" rows={2} maxLength={1000} defaultValue={v?.notes} className={`${inputCls} h-auto py-2`} />
      </Field>
    </div>
  );
}

export default async function VenuesPage() {
  const venues = await listVenues();
  return (
    <>
      <PageTitle title="Venues" description="Where fixtures are played. A venue with fixtures cannot be deleted." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="All venues">
          {venues.length === 0 ? (
            <Empty title="No venues yet" />
          ) : (
            <ul className="divide-y divide-line">
              {venues.map((v) => (
                <li key={v.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold break-words">{v.name}</p>
                      <p className="text-sm text-ink-muted">
                        {v.short_name} · {v.match_count} fixture{v.match_count === 1 ? "" : "s"}
                      </p>
                      {v.notes && <p className="mt-1 text-sm break-words whitespace-pre-line">{v.notes}</p>}
                    </div>
                    {v.match_count === 0 && (
                      <ConfirmAction action={deleteVenue} hidden={{ id: v.id }} trigger="Delete" triggerClass={btn.small} title={`Delete ${v.name}?`} confirmLabel="Delete venue" />
                    )}
                  </div>
                  <Disclosure summary="Edit">
                    <ActionForm action={saveVenue}>
                      <VenueFields v={v} />
                      <Submit className={`${btn.primary} mt-3`}>Save venue</Submit>
                    </ActionForm>
                  </Disclosure>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="New venue">
          <ActionForm action={saveVenue} resetOnSuccess>
            <VenueFields />
            <Submit className={`${btn.primary} mt-3 w-full`}>Create venue</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
