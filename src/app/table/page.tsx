import type { Metadata } from "next";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableIcon } from "@/components/ui/icons";
import { getCompetitions, getStandings } from "@/lib/data";
import { param } from "@/lib/filters";
import { promotionFor } from "@/lib/competition";

export const metadata: Metadata = { title: "Tables" };

export default async function TablePage({ searchParams }: PageProps<"/table">) {
  const competitionParam = param((await searchParams).competition);
  const leagues = (await getCompetitions()).filter((c) => c.format === "league");
  const selected = leagues.find((c) => c.id === competitionParam) ?? leagues[0];

  if (!selected) {
    return (
      <>
        <PageHeader title="Tables" />
        <EmptyState icon={<TableIcon size={22} />} title="No league tables yet" description="Tables appear once a league competition starts." />
      </>
    );
  }

  const rows = await getStandings(selected.id);
  const promotion = promotionFor(selected);

  return (
    <>
      <PageHeader title="Tables" subtitle={`${selected.name} · ${selected.season}`} />
      <FilterChips
        label="Choose competition"
        options={leagues.map((c) => ({
          label: c.shortName,
          href: `/table?competition=${encodeURIComponent(c.id)}`,
          active: c.id === selected.id,
        }))}
      />
      <div className="mt-4">
        {rows.length > 0 ? (
          <StandingsTable
            rows={rows}
            caption={`${selected.name} standings`}
            promotionSpots={promotion?.spots}
            promotionLabel={promotion?.label}
          />
        ) : (
          <EmptyState icon={<TableIcon size={22} />} title="Table not available" description="Standings will appear after the first matches are played." />
        )}
        <p className="mt-3 px-1 text-xs text-ink-faint">
          Only completed matches count. Abandoned, postponed and cancelled fixtures are excluded.
        </p>
      </div>
    </>
  );
}
