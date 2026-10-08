import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { BallIcon } from "@/components/ui/icons";
import { getCompetition, getTopScorers } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/scorers">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} top scorers` : "Top scorers" };
}

/** Goals + penalties by named players across the competition's live and finished matches. */
export default async function CompetitionScorers({ params }: PageProps<"/competitions/[id]/scorers">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();
  const rows = await getTopScorers(id);
  const leaders = rows.filter((r) => r.rank === 1);

  return (
    <>
      <AutoRefresh seconds={30} />
      {rows.length === 0 ? (
        <EmptyState icon={<BallIcon size={22} />} title="No goals yet" description="The top scorers appear here as goals are recorded." />
      ) : (
        <div className="rounded-card border border-line bg-surface">
          {leaders.length > 1 && (
            <p className="border-b border-line px-3 py-2 text-xs font-bold text-ink-muted">
              Joint leaders on {leaders[0].goals} goal{leaders[0].goals === 1 ? "" : "s"}
            </p>
          )}
          <table className="w-full text-sm">
            <caption className="sr-only">{competition.name} top scorers</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold tracking-wide text-ink-muted uppercase">
                <th scope="col" className="w-10 px-3 py-2 text-center">#</th>
                <th scope="col" className="px-2 py-2">Player</th>
                <th scope="col" className="px-2 py-2">Team</th>
                <th scope="col" className="w-14 px-3 py-2 text-right">Goals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => {
                const tied = rows.filter((x) => x.rank === r.rank).length > 1;
                return (
                  <tr key={`${r.teamId}-${r.playerName}-${i}`}>
                    <td className="px-3 py-2 text-center font-display font-bold tabular-nums">{tied ? `=${r.rank}` : r.rank}</td>
                    <td className="px-2 py-2 font-semibold">{r.playerName ?? "Unnamed player"}</td>
                    <td className="px-2 py-2 text-ink-muted">{r.teamShortName}</td>
                    <td className="px-3 py-2 text-right font-display text-base font-extrabold tabular-nums">{r.goals}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 px-1 text-xs text-ink-faint">
        Goals and penalties by named players in live and completed matches. Own goals are not counted. Updates about every 30 seconds.
      </p>
    </>
  );
}
