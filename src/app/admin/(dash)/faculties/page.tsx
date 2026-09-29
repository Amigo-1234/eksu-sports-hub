import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { Badge, btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { deleteDepartment, deleteFaculty, saveDepartment, saveFaculty } from "@/lib/admin/actions/reference";
import { listFaculties } from "@/lib/admin/data/reference";

export const metadata: Metadata = { title: "Faculties & Departments" };

export default async function FacultiesPage() {
  const faculties = await listFaculties();
  return (
    <>
      <PageTitle
        title="Faculties & Departments"
        description="Teams represent a faculty or department. Anything still used by a team cannot be deleted."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {faculties.length === 0 && (
            <Card>
              <Empty title="No faculties yet" />
            </Card>
          )}
          {faculties.map((f) => (
            <Card
              key={f.id}
              title={f.name}
              description={`${f.code} · ${f.team_count} team${f.team_count === 1 ? "" : "s"} · ${f.departments.length} department${f.departments.length === 1 ? "" : "s"}`}
              actions={
                f.team_count === 0 && f.departments.length === 0 ? (
                  <ConfirmAction
                    action={deleteFaculty}
                    hidden={{ id: f.id }}
                    trigger="Delete"
                    triggerClass={btn.small}
                    title={`Delete ${f.name}?`}
                    body="It has no departments or teams. This cannot be undone."
                    confirmLabel="Delete faculty"
                  />
                ) : undefined
              }
            >
              <Disclosure summary="Rename faculty">
                <ActionForm action={saveFaculty} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                  <input type="hidden" name="id" value={f.id} />
                  <Field scope={f.id} label="Name">
                    <input name="name" required maxLength={120} defaultValue={f.name} className={inputCls} />
                  </Field>
                  <Field scope={f.id} label="Short name">
                    <input name="code" required maxLength={12} defaultValue={f.code} className={`${inputCls} uppercase`} />
                  </Field>
                  <Submit className={btn.primary}>Save</Submit>
                </ActionForm>
              </Disclosure>
              <h3 className="mt-4 mb-2 text-xs font-extrabold tracking-wide text-ink-muted uppercase">Departments</h3>
              {f.departments.length === 0 ? (
                <p className="text-sm text-ink-muted">No departments.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {f.departments.map((d) => (
                    <li key={d.id} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-sm">
                          <span className="font-bold">{d.name}</span> <Badge tone="muted">{d.code}</Badge>
                          {d.team_count > 0 && <span className="ml-2 text-xs text-ink-muted">{d.team_count} team(s)</span>}
                        </span>
                        {d.team_count === 0 && (
                          <ConfirmAction
                            action={deleteDepartment}
                            hidden={{ id: d.id }}
                            trigger="Delete"
                            triggerClass={btn.small}
                            title={`Delete ${d.name}?`}
                            confirmLabel="Delete department"
                          />
                        )}
                      </div>
                      <Disclosure summary="Edit">
                        <ActionForm action={saveDepartment} className="grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="id" value={d.id} />
                          <Field scope={d.id} label="Name">
                            <input name="name" required maxLength={120} defaultValue={d.name} className={inputCls} />
                          </Field>
                          <Field scope={d.id} label="Short name">
                            <input name="code" required maxLength={12} defaultValue={d.code} className={`${inputCls} uppercase`} />
                          </Field>
                          <Field scope={d.id} label="Faculty" className="sm:col-span-2">
                            <select name="faculty_id" defaultValue={d.faculty_id} className={selectCls}>
                              {faculties.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Submit className={`${btn.primary} sm:col-span-2 sm:justify-self-start`}>Save department</Submit>
                        </ActionForm>
                      </Disclosure>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <Card title="New faculty">
            <ActionForm action={saveFaculty} resetOnSuccess className="space-y-3">
              <Field scope="new-faculty" label="Name">
                <input name="name" required maxLength={120} placeholder="Faculty of Science" className={inputCls} />
              </Field>
              <Field scope="new-faculty" label="Short name" hint="Unique, e.g. SCI">
                <input name="code" required maxLength={12} className={`${inputCls} uppercase`} />
              </Field>
              <Submit className={`${btn.primary} w-full`}>Create faculty</Submit>
            </ActionForm>
          </Card>
          <Card title="New department">
            {faculties.length === 0 ? (
              <p className="text-sm text-ink-muted">Create a faculty first.</p>
            ) : (
              <ActionForm action={saveDepartment} resetOnSuccess className="space-y-3">
                <Field scope="new-department" label="Faculty">
                  <select name="faculty_id" required className={selectCls}>
                    {faculties.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field scope="new-department" label="Name">
                  <input name="name" required maxLength={120} placeholder="Computer Science" className={inputCls} />
                </Field>
                <Field scope="new-department" label="Short name" hint="Unique, e.g. CSC">
                  <input name="code" required maxLength={12} className={`${inputCls} uppercase`} />
                </Field>
                <Submit className={`${btn.primary} w-full`}>Create department</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
