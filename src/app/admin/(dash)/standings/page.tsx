import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { btn, Card, Empty, Field, PageTitle, selectCls, TableWrap, td, th } from "@/components/admin/ui";
import { recomputeStandings } from "@/lib/admin/actions/competitions";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { getStandings } from "@/lib/admin/data/standings";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Standings" };

/** Read-only tables computed by the database from full-time results. */
export default async function StandingsPage({ searchParams }: PageProps<"/admin/standings">) {
  const sp = await searchParams;
  const competitions = await listCompetitionOptions();
  const compId = typeof sp.competition === "string" && competitions.some((c) => c.id === sp.competition) ? sp.competition : competitions[0]?.id;
  const comp = competitions.find((c) => c.id === compId);
  const rows = compId ? await getStandings(compId) : [];
  const groups = comp?.stages.flatMap((s) => s.groups.map((g) => ({ ...g, stage: s.name }))) ?? [];
  const groupFilter = typeof sp.group === "string" ? sp.group : "";
  const tables = groups.length
    ? groups.filter((g) => !groupFilter || g.id === groupFilter).map((g) => ({ title: `${g.stage} — ${g.name}`, rows: rows.filter((r) => r.group_id === g.id) }))
    : [{ title: "League table", rows }];
  const ungrouped = groups.length ? rows.filter((r) => !r.group_id) : [];
  if (ungrouped.length && !groupFilter) tables.push({ title: "Not in a group", rows: ungrouped });
  const updated = rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);

  return (
    <>
      <PageTitle title="Standings" description="Computed from full-time results using the competition's points and tie-breaker settings. Cells are not editable: fix results through event corrections." />
      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3">
          <Field label="Competition" className="w-72 max-w-full">
            <select name="competition" defaultValue={compId} className={selectCls}>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.season})
                </option>
              ))}
            </select>
          </Field>
          {groups.length > 0 && (
            <Field label="Stage / group" className="w-56 max-w-full">
              <select name="group" defaultValue={groupFilter} className={selectCls}>
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.stage} — {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button className={btn.secondary}>Show</button>
        </form>
        {comp && (
          <ActionForm action={recomputeStandings} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="competition_id" value={comp.id} />
            <Submit className={btn.primary} pendingLabel="Recomputing…">
              Recompute standings
            </Submit>
            <span className="text-xs text-ink-muted">Last computed: {formatWatDateTime(updated)}</span>
          </ActionForm>
        )}
      </Card>
      {!comp ? (
        <Card>
          <Empty title="No competitions yet" />
        </Card>
      ) : (
        <div className="space-y-6">
          {tables.map((t) => (
            <Card key={t.title} title={t.title}>
              {t.rows.length === 0 ? (
                <Empty title="No results yet">Rows appear once matches reach full-time.</Empty>
              ) : (
                <TableWrap label={t.title}>
                  <table className="w-full min-w-[34rem] tabular-nums">
                    <thead>
                      <tr className="border-b border-line">
                        <th className={th} scope="col">
                          <abbr title="Rank">#</abbr>
                        </th>
                        <th className={th} scope="col">Team</th>
                        {[
                          ["P", "Played"],
                          ["W", "Won"],
                          ["D", "Drawn"],
                          ["L", "Lost"],
                          ["GF", "Goals for"],
                          ["GA", "Goals against"],
                          ["GD", "Goal difference"],
                          ["Pts", "Points"],
                        ].map(([a, full]) => (
                          <th key={a} scope="col" className={`${th} text-right`}>
                            <abbr title={full}>{a}</abbr>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {t.rows.map((r) => (
                        <tr key={r.team.id}>
                          <td className={`${td} font-bold`}>{r.rank}</td>
                          <th scope="row" className={`${td} text-left font-semibold`}>
                            {r.team.name}
                          </th>
                          <td className={`${td} text-right`}>{r.played}</td>
                          <td className={`${td} text-right`}>{r.wins}</td>
                          <td className={`${td} text-right`}>{r.draws}</td>
                          <td className={`${td} text-right`}>{r.losses}</td>
                          <td className={`${td} text-right`}>{r.goals_for}</td>
                          <td className={`${td} text-right`}>{r.goals_against}</td>
                          <td className={`${td} text-right`}>{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}</td>
                          <td className={`${td} text-right font-extrabold`}>{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
