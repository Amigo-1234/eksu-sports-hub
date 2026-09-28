import type { Metadata } from "next";
import { MatchesByDate } from "@/components/match/MatchList";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { PageHeader } from "@/components/ui/PageHeader";
import { ResultsIcon } from "@/components/ui/icons";
import { getCompetitions, getMatches, getNow } from "@/lib/data";
import { competitionChips, param } from "@/lib/filters";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  const competitionParam = param((await searchParams).competition);
  const now = await getNow();
  const competitions = await getCompetitions();
  const selected = competitions.find((c) => c.id === competitionParam);
  const results = await getMatches({ scope: "results", competitionId: selected?.id });

  return (
    <>
      <PageHeader title="Results" subtitle="Completed matches, most recent first" />
      <FilterChips label="Filter by competition" options={competitionChips("/results", competitions, selected?.id)} />
      <div className="mt-4">
        {results.length > 0 ? (
          <MatchesByDate matches={results} serverNow={now} />
        ) : (
          <EmptyState
            icon={<ResultsIcon size={22} />}
            title="No results yet"
            description={
              selected
                ? `No ${selected.name} matches have finished yet.`
                : "Completed matches will appear here after full-time."
            }
            action={selected ? { href: "/results", label: "Show all competitions" } : { href: "/fixtures", label: "See upcoming fixtures" }}
          />
        )}
      </div>
    </>
  );
}
