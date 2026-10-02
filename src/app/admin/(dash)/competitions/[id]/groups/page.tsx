import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CompetitionHeader } from "@/components/admin/CompetitionHeader";
import { Badge, btn, Card, Empty, Field, inputCls, selectCls } from "@/components/admin/ui";
import { assignGroupAction, createGroupsAction } from "@/lib/admin/actions/engine";
import { getCompetitionOverview } from "@/lib/admin/data/engine";

export const metadata: Metadata = { title: "Groups & draw" };

export default async function GroupsPage({ params }: PageProps<"/admin/competitions/[id]/groups">) {
  const { id } = await params;
  const o = await getCompetitionOverview(id);
  if (!o) notFound();
  const groupStages = o.stages.filter((s) => s.stage_type === "GROUP");

  return (
    <>
      <CompetitionHeader o={o} section="Groups" />
      {groupStages.length === 0 ? (
        <Empty title="This competition has no group stage">
          Add a stage of type <strong>Group stage</strong> in{" "}
          <Link href={`/admin/competitions/${id}/setup`} className="underline">
            Setup
          </Link>
          .
        </Empty>
      ) : (
        <div className="space-y-6">
          {groupStages.map((s) => {
            const groups = (s.groups ?? []).filter((g) => g.id);
            const ops = o.stage_ops.find((x) => x.stage_id === s.id);
            const locked = ops?.locked ?? s.locked;
            return (
              <Card
                key={s.id}
                title={s.name}
                description={
                  locked
                    ? "Locked: matches of this stage have started. Moving a team needs an override reason (audited)."
                    : "Draw teams into groups, then generate the fixtures. Teams can be moved until the first match kicks off."
                }
                actions={locked ? <Badge tone="warn">Locked</Badge> : undefined}
              >
                <ActionForm action={createGroupsAction} resetOnSuccess className="mb-4 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="stage_id" value={s.id} />
                  <Field scope={`${s.id}-count`} label="Create groups A, B, C…" className="w-40">
                    <input type="number" name="count" min={1} max={16} placeholder="e.g. 4" className={inputCls} />
                  </Field>
                  <span className="pb-2 text-sm text-ink-muted">or</span>
                  <Field scope={`${s.id}-names`} label="Names (comma-separated)" className="min-w-0 flex-1">
                    <input name="names" maxLength={400} placeholder="Group North, Group South" className={inputCls} />
                  </Field>
                  <Submit className={btn.secondary}>Create</Submit>
                </ActionForm>

                {groups.length > 0 && (
                  <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groups.map((g) => {
                      const members = o.entries.filter((e) => e.group_id === g.id);
                      return (
                        <section key={g.id} className="rounded-lg border border-line p-3" aria-label={g.name ?? "Group"}>
                          <p className="font-bold">
                            {g.name} <span className="text-xs font-semibold text-ink-muted">({members.length})</span>
                          </p>
                          <ul className="mt-1 space-y-0.5 text-sm">
                            {members.map((e) => (
                              <li key={e.team_id} className="break-words">
                                {e.name}
                              </li>
                            ))}
                            {members.length === 0 && <li className="text-ink-muted">No teams yet</li>}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                )}

                {groups.length > 0 && (
                  <ul className="divide-y divide-line">
                    {o.entries.map((e) => (
                      <li key={e.team_id} className="py-2">
                        <ActionForm action={assignGroupAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="competition_id" value={id} />
                          <input type="hidden" name="team_id" value={e.team_id} />
                          <span className="w-full min-w-0 font-semibold break-words sm:w-48">{e.name}</span>
                          <select name="group_id" defaultValue={e.group_id ?? ""} className={`${selectCls} w-44`} aria-label={`Group for ${e.name}`}>
                            <option value="">Not drawn</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id!}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                          {locked && (
                            <input name="override_reason" required maxLength={300} placeholder="Override reason" aria-label={`Override reason for ${e.name}`} className={`${inputCls} w-56`} />
                          )}
                          <Submit className={btn.small}>{locked ? "Override & move" : "Save"}</Submit>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
