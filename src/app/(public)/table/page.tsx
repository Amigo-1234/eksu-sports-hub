import type { Metadata } from "next";
import { LeagueTable } from "@/components/standings/LeagueTable";
import { nextFixtures, splitTable } from "@/lib/standings-views";
import { TopScorersCard } from "@/components/standings/TopScorersCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableIcon } from "@/components/ui/icons";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { getCompetitions, getMatches, getStandings, getTopScorers } from "@/lib/data";
import { param } from "@/lib/filters";
import { promotionFor } from "@/lib/competition";

export const metadata: Metadata = { title: "Tables" };

export default async function TablePage({ searchParams }: PageProps<"/table">) {
  const competitionParam = param((await searchParams).competition);
  const leagues = (await getCompetitions()).filter((c) => c.format === "league");
  const selected = leagues.find((c) => c.id === competitionParam) ?? leagues[0];

  if (!selected) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Tables" />
        <EmptyState icon={<TableIcon size={18} />} title="No league tables yet" description="Tables appear once a league competition starts." />
      </div>
    );
  }

  const [rows, live, scorers, results, upcoming] = await Promise.all([
    getStandings(selected.id),
    getMatches({ scope: "live", competitionId: selected.id }),
    getTopScorers(selected.id).catch(() => []),
    getMatches({ scope: "results", competitionId: selected.id }).catch(() => []),
    getMatches({ scope: "upcoming", competitionId: selected.id }).catch(() => []),
  ]);
  const promotion = promotionFor(selected);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tables" subtitle={`${selected.name} · ${selected.season}`} />
      {/* Live table: refresh only while this league has a match in play. */}
      {live.length > 0 && <AutoRefresh seconds={20} />}
      <FilterChips
        label="Choose competition"
        options={leagues.map((c) => ({
          label: c.shortName,
          href: `/table?competition=${encodeURIComponent(c.id)}`,
          active: c.id === selected.id,
        }))}
      />
      <div className="mt-3">
        {rows.length > 0 ? (
          <LeagueTable
            rows={rows}
            home={splitTable(rows, results, "home")}
            away={splitTable(rows, results, "away")}
            next={nextFixtures(upcoming)}
            caption={`${selected.name} standings`}
            promotionSpots={promotion?.spots}
            promotionLabel={promotion?.label}
          />
        ) : (
          <EmptyState icon={<TableIcon size={18} />} title="Table not available" description="Standings will appear after the first matches are played." />
        )}
        <p className="mt-3 px-1 text-xs text-ink-faint">
          {live.length > 0
          ? "Live: matches in progress count at their current score until full-time. Abandoned, postponed and cancelled fixtures are excluded."
          : "Only completed matches count. Abandoned, postponed and cancelled fixtures are excluded."}
        </p>
        {scorers.length > 0 && (
          <div className="mt-5">
            <TopScorersCard rows={scorers} competitionId={selected.id} competitionName={selected.name} />
          </div>
        )}
      </div>
    </div>
  );
}
