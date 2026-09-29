import type { Metadata } from "next";
import Link from "next/link";
import { FORMAT_LABEL } from "@/components/admin/CompetitionFields";
import { Badge, btn, Card, Empty, PageTitle, TableWrap, td, th } from "@/components/admin/ui";
import { listCompetitions } from "@/lib/admin/data/competitions";

export const metadata: Metadata = { title: "Competitions" };

const STATUS_TONE = { DRAFT: "warn", ACTIVE: "ok", ARCHIVED: "muted" } as const;

export default async function CompetitionsPage() {
  const list = await listCompetitions();
  return (
    <>
      <PageTitle
        title="Competitions"
        description="Draft competitions are hidden from match-day warnings until activated. Competitions are archived, never deleted."
        actions={
          <Link href="/admin/competitions/new" className={btn.primary}>
            New competition
          </Link>
        }
      />
      <Card>
        {list.length === 0 ? (
          <Empty title="No competitions yet" action={<Link href="/admin/competitions/new" className={btn.primary}>Create competition</Link>} />
        ) : (
          <TableWrap label="Competitions">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Competition</th>
                  <th className={th}>Season</th>
                  <th className={th}>Format</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Teams</th>
                  <th className={`${th} text-right`}>Fixtures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-subtle">
                    <td className={td}>
                      <Link href={`/admin/competitions/${c.id}`} className="font-bold text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-ink-muted">
                        {c.short_name} · {c.sport.name} · {c.category.toLowerCase()}
                      </span>
                    </td>
                    <td className={td}>{c.season.name}</td>
                    <td className={td}>{FORMAT_LABEL[c.format]}</td>
                    <td className={td}>
                      <Badge tone={STATUS_TONE[c.status]}>{c.status.toLowerCase()}</Badge>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{c.entry_count}</td>
                    <td className={`${td} text-right tabular-nums`}>{c.match_count}</td>
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
