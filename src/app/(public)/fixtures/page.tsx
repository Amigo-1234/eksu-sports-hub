import type { Metadata } from "next";
import { MatchesByDate } from "@/components/match/MatchList";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarIcon } from "@/components/ui/icons";
import { getCompetitions, getMatches, getNow } from "@/lib/data";
import { competitionChips, param } from "@/lib/filters";

export const metadata: Metadata = { title: "Fixtures" };

export default async function FixturesPage({ searchParams }: PageProps<"/fixtures">) {
  const competitionParam = param((await searchParams).competition);
  const now = await getNow();
  const competitions = await getCompetitions();
  const selected = competitions.find((c) => c.id === competitionParam);
  const fixtures = await getMatches({ scope: "upcoming", competitionId: selected?.id });

  return (
    <>
      <PageHeader title="Fixtures" subtitle="Upcoming matches · times in WAT" />
      <FilterChips label="Filter by competition" options={competitionChips("/fixtures", competitions, selected?.id)} />
      <div className="mt-4">
        {fixtures.length > 0 ? (
          <MatchesByDate matches={fixtures} serverNow={now} />
        ) : (
          <EmptyState
            icon={<CalendarIcon size={22} />}
            title="No upcoming fixtures"
            description={
              selected
                ? `Nothing scheduled for the ${selected.name} yet.`
                : "No matches are scheduled yet. Check back soon."
            }
            action={selected ? { href: "/fixtures", label: "Show all competitions" } : { href: "/results", label: "See recent results" }}
          />
        )}
      </div>
    </>
  );
}
