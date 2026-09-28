import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableIcon } from "@/components/ui/icons";
import { getCompetition, getStandings } from "@/lib/data";
import { promotionFor } from "@/lib/competition";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/table">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} table` : "Table" };
}

export default async function CompetitionTable({ params }: PageProps<"/competitions/[id]/table">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  if (competition.format !== "league") {
    return (
      <EmptyState
        icon={<TableIcon size={22} />}
        title="No table for this competition"
        description="This is a knockout competition — follow progress round by round on the overview."
        action={{ href: `/competitions/${id}`, label: "View rounds" }}
      />
    );
  }

  const rows = await getStandings(id);
  const promotion = promotionFor(competition);
  return rows.length > 0 ? (
    <>
      <StandingsTable
        rows={rows}
        caption={`${competition.name} standings`}
        promotionSpots={promotion?.spots}
        promotionLabel={promotion?.label}
      />
      <p className="mt-3 px-1 text-xs text-ink-faint">
        Only completed matches count. Abandoned, postponed and cancelled fixtures are excluded.
      </p>
    </>
  ) : (
    <EmptyState icon={<TableIcon size={22} />} title="Table not available yet" />
  );
}
