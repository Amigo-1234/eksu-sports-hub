import type { Metadata } from "next";
import Link from "next/link";
import { Badge, btn, Card, Empty, inputCls, PageTitle, Swatch, TableWrap, td, th } from "@/components/admin/ui";
import { listTeams } from "@/lib/admin/data/teams";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage({ searchParams }: PageProps<"/admin/teams">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const teams = await listTeams(q);
  return (
    <>
      <PageTitle
        title="Teams"
        description="Teams are deactivated rather than deleted, so results stay intact."
        actions={
          <Link href="/admin/teams/new" className={btn.primary}>
            New team
          </Link>
        }
      />
      <Card>
        <form role="search" className="mb-4 flex gap-2">
          <label className="sr-only" htmlFor="team-q">
            Search teams
          </label>
          <input id="team-q" name="q" defaultValue={q} placeholder="Search name, code or slug" className={`${inputCls} max-w-sm`} />
          <button className={btn.secondary}>Search</button>
        </form>
        {teams.length === 0 ? (
          <Empty title={q ? `No teams match “${q}”` : "No teams yet"} />
        ) : (
          <TableWrap label="Teams">
            <table className="w-full min-w-[38rem]">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Team</th>
                  <th className={th}>Code</th>
                  <th className={th}>Faculty / department</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {teams.map((t) => (
                  <tr key={t.id} className="hover:bg-subtle">
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <Swatch color={t.color_primary} />
                        <Link href={`/admin/teams/${t.id}`} className="font-bold text-brand-700 hover:underline">
                          {t.name}
                        </Link>
                      </span>
                      <span className="block font-mono text-xs text-ink-muted">{t.slug}</span>
                    </td>
                    <td className={td}>{t.code}</td>
                    <td className={td}>{[t.faculty?.name, t.department?.name].filter(Boolean).join(" · ") || <span className="text-ink-faint">—</span>}</td>
                    <td className={td}>{t.active ? <Badge tone="ok">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
