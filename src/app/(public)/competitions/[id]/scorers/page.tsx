import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamCrest } from "@/components/team/TeamCrest";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCompetition, getCompetitionDetail } from "@/lib/data";
import type { PublicPlayerStat } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/scorers">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} top scorers` : "Top scorers" };
}

function StatTable({ rows, caption, value, valueLabel, extra }: { rows: PublicPlayerStat[]; caption: string; value: (p: PublicPlayerStat) => number | undefined; valueLabel: string; extra?: { label: string; get: (p: PublicPlayerStat) => string | number | undefined } }) {
  // Shared positions for equal values (1, 2, 2, 4 …).
  const ranks = rows.map((p, i) => (i === 0 ? 1 : 0) || rows.findIndex((q) => value(q) === value(p)) + 1);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-10" />
          <col />
          {extra && <col className="hidden w-16 min-[420px]:table-column" />}
          <col className="w-14" />
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-subtle/60 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
            <th scope="col" className="py-2 text-center">#</th>
            <th scope="col" className="py-2 pl-1 text-left">Player</th>
            {extra && <th scope="col" className="hidden py-2 text-center min-[420px]:table-cell">{extra.label}</th>}
            <th scope="col" className="py-2 pr-2 text-center text-ink">{valueLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p, i) => {
            const v = value(p);
            return (
              <tr key={`${p.playerId}-${p.team.id}`}>
                <td className="py-2.5 text-center font-semibold text-ink-muted tabular-nums">{ranks[i]}</td>
                <th scope="row" className="py-2 pl-1 text-left font-normal">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <Link href={`/teams/${p.team.id}`} className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-700">
                    <TeamCrest team={p.team} size="xs" />
                    <span className="truncate">{p.team.shortName}</span>
                  </Link>
                </th>
                {extra && <td className="hidden py-2.5 text-center text-ink-muted tabular-nums min-[420px]:table-cell">{extra.get(p) ?? "–"}</td>}
                <td className="py-2.5 pr-2 text-center font-display text-base font-bold tabular-nums">{v}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function CompetitionScorers({ params }: PageProps<"/competitions/[id]/scorers">) {
  const { id } = await params;
  const [competition, detail] = await Promise.all([getCompetition(id), getCompetitionDetail(id)]);
  if (!competition) notFound();
  if (!detail || detail.scorers.length === 0) {
    return <EmptyState title="No scorers yet" description="Top scorers appear here once goals are recorded with the scorer named." />;
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="scorers" className="min-w-0">
        <SectionHeader id="scorers" title="Top scorers" />
        <StatTable rows={detail.scorers} caption={`${competition.name} top scorers`} value={(p) => p.goals} valueLabel="Goals" extra={{ label: "Apps", get: (p) => p.appearances }} />
        <p className="mt-2 px-1 text-xs text-ink-faint">From recorded match events. Own goals do not count for the scorer; penalty shoot-out goals are not included. Assists are not recorded.</p>
      </section>
      {detail.cleanSheets.length > 0 && (
        <section aria-labelledby="cs" className="min-w-0">
          <SectionHeader id="cs" title="Clean sheets" />
          <StatTable rows={detail.cleanSheets} caption={`${competition.name} clean sheets`} value={(p) => p.cleanSheets} valueLabel="CS" />
          <p className="mt-2 px-1 text-xs text-ink-faint">Starting goalkeepers on a confirmed team sheet who played the whole match.</p>
        </section>
      )}
    </div>
  );
}
