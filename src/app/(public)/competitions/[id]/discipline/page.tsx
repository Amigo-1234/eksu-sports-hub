import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCompetition, getCompetitionDetail } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/discipline">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} discipline` : "Discipline" };
}

const REASON = { RED_CARD: "Red card", SECOND_YELLOW: "Two yellows (sent off)", YELLOW_ACCUMULATION: "Yellow cards", ADMIN: "Disciplinary decision" } as const;

export default async function CompetitionDiscipline({ params }: PageProps<"/competitions/[id]/discipline">) {
  const { id } = await params;
  const [competition, detail] = await Promise.all([getCompetition(id), getCompetitionDetail(id)]);
  if (!competition) notFound();
  if (!detail || (detail.discipline.players.length === 0 && detail.discipline.suspensions.length === 0)) {
    return <EmptyState title="No cards yet" description="Bookings and suspensions in this competition appear here." />;
  }
  const active = detail.discipline.suspensions.filter((s) => s.status === "ACTIVE");
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="cards" className="min-w-0">
        <SectionHeader id="cards" title="Cards" />
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Cards per player</caption>
            <colgroup>
              <col />
              <col className="w-12" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-subtle/60 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
                <th scope="col" className="py-2 pl-3 text-left">Player</th>
                <th scope="col" className="py-2 text-center"><abbr title="Yellow cards" className="no-underline">Y</abbr></th>
                <th scope="col" className="py-2 pr-2 text-center"><abbr title="Red cards (incl. second yellow)" className="no-underline">R</abbr></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {detail.discipline.players.map((p) => (
                <tr key={`${p.playerId}-${p.team.id}`}>
                  <th scope="row" className="py-2 pl-3 text-left font-normal">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-ink-muted">{p.team.shortName}</span>
                  </th>
                  <td className="py-2.5 text-center tabular-nums">{p.yellows ?? 0}</td>
                  <td className="py-2.5 pr-2 text-center tabular-nums">{(p.reds ?? 0) + (p.secondYellows ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="susp" className="min-w-0">
        <SectionHeader id="susp" title="Suspensions" />
        {active.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink-muted">Nobody is suspended.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {active.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {s.team.shortName} · {REASON[s.reason]}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold">
                  {s.matchesTotal - s.matchesServed} match{s.matchesTotal - s.matchesServed === 1 ? "" : "es"} left
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
