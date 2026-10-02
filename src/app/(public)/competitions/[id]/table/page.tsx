import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TableIcon } from "@/components/ui/icons";
import { getCompetition, getCompetitionDetail, getStandings } from "@/lib/data";
import { promotionFor } from "@/lib/competition";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/table">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} table` : "Table" };
}

export default async function CompetitionTable({ params }: PageProps<"/competitions/[id]/table">) {
  const { id } = await params;
  const [competition, detail] = await Promise.all([getCompetition(id), getCompetitionDetail(id)]);
  if (!competition) notFound();

  // Engine data: every table stage, each group in its own table (with qualification).
  const tableStages = detail?.stages.filter((s) => s.hasTable && !s.isKnockout && s.groups.some((g) => g.rows.length > 0)) ?? [];
  if (detail && tableStages.length > 0) {
    return (
      <div className="space-y-8">
        {tableStages.map((s) => (
          <section key={s.id} aria-labelledby={`st-${s.id}`}>
            {tableStages.length > 1 && <SectionHeader id={`st-${s.id}`} title={s.name} />}
            <div className={s.groups.length > 1 ? "grid gap-5 xl:grid-cols-2" : ""}>
              {s.groups.map((g) => (
                <div key={g.id ?? "league"} className="min-w-0">
                  {g.name && (
                    <h2 id={tableStages.length > 1 ? undefined : `st-${s.id}`} className="mb-2 font-display text-lg font-extrabold">
                      {g.name}
                      {!g.complete && <span className="ml-2 text-xs font-semibold text-ink-faint">in progress</span>}
                    </h2>
                  )}
                  <StandingsTable rows={g.rows} caption={`${g.name ?? competition.name} standings`} />
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="px-1 text-xs text-ink-faint">
          Only completed matches count. Qualification is confirmed once a group has finished; teams still level after every tie-breaker share a position.
        </p>
      </div>
    );
  }

  if (competition.format !== "league") {
    return (
      <EmptyState
        icon={<TableIcon size={22} />}
        title="No table for this competition"
        description="This is a knockout competition — follow progress round by round."
        action={{ href: `/competitions/${id}${detail ? "/knockout" : ""}`, label: "View rounds" }}
      />
    );
  }

  const rows = await getStandings(id);
  const promotion = promotionFor(competition);
  return rows.length > 0 ? (
    <>
      <StandingsTable rows={rows} caption={`${competition.name} standings`} promotionSpots={promotion?.spots} promotionLabel={promotion?.label} />
      <p className="mt-3 px-1 text-xs text-ink-faint">Only completed matches count. Abandoned, postponed and cancelled fixtures are excluded.</p>
    </>
  ) : (
    <EmptyState icon={<TableIcon size={22} />} title="Table not available yet" />
  );
}
