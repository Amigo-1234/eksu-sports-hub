import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveMatchCard } from "@/components/match/LiveMatchCard";
import { MatchCardList, MatchesByDate } from "@/components/match/MatchList";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCompetition, getMatches, getNow, getStandings } from "@/lib/data";
import { promotionFor } from "@/lib/competition";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c?.name ?? "Competition" };
}

export default async function CompetitionOverview({ params }: PageProps<"/competitions/[id]">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const now = await getNow();
  const [live, upcoming, results, all, standings] = await Promise.all([
    getMatches({ scope: "live", competitionId: id }),
    getMatches({ scope: "upcoming", competitionId: id, limit: 4 }),
    getMatches({ scope: "results", competitionId: id }),
    getMatches({ competitionId: id }),
    getStandings(id),
  ]);

  const completed = results.filter((m) => m.status === "FULL_TIME");
  const goals = completed.reduce((n, m) => n + (m.score ? m.score.home + m.score.away : 0), 0);
  const base = `/competitions/${id}`;

  // Knockout: show every round that exists, latest first.
  const rounds = competition.format === "knockout" ? [...new Set(all.map((m) => m.round))].reverse() : [];

  return (
    <div className="grid gap-x-6 gap-y-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-7">
        <section aria-label="About" className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-ink-muted">{competition.description}</p>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-line text-center">
            {[
              ["Teams", competition.teamIds.length],
              ["Played", completed.length],
              ["Goals", goals],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{k}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {live.length > 0 && (
          <section aria-labelledby="c-live">
            <SectionHeader id="c-live" title="Live now" />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {live.map((m) => (
                <li key={m.id}>
                  <LiveMatchCard match={m} serverNow={now} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {competition.format === "knockout" ? (
          rounds.map((round) => (
            <section key={round} aria-labelledby={`r-${round}`}>
              <SectionHeader id={`r-${round}`} title={round} />
              <MatchCardList
                matches={all.filter((m) => m.round === round)}
                serverNow={now}
                showCompetition={false}
              />
            </section>
          ))
        ) : (
          <>
            <section aria-labelledby="c-next">
              <SectionHeader id="c-next" title="Next fixtures" href={`${base}/fixtures`} />
              {upcoming.length > 0 ? (
                <MatchesByDate matches={upcoming} serverNow={now} />
              ) : (
                <EmptyState compact title="No upcoming fixtures" />
              )}
            </section>
            <section aria-labelledby="c-results">
              <SectionHeader id="c-results" title="Latest results" href={`${base}/results`} />
              {results.length > 0 ? (
                <MatchesByDate matches={results.slice(0, 4)} serverNow={now} />
              ) : (
                <EmptyState compact title="No results yet" />
              )}
            </section>
          </>
        )}
      </div>

      {standings.length > 0 && (
        <aside aria-labelledby="c-table" className="min-w-0">
          <SectionHeader id="c-table" title="Table" href={`${base}/table`} linkLabel="Full table" />
          <StandingsTable
            rows={standings}
            caption={`${competition.name} standings`}
            compact
            promotionSpots={promotionFor(competition)?.spots}
          />
        </aside>
      )}
    </div>
  );
}
