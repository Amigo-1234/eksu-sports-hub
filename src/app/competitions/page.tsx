import type { Metadata } from "next";
import { CompetitionLinkList } from "@/components/competition/CompetitionLinkList";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrophyIcon } from "@/components/ui/icons";
import { getCompetitions, getSports } from "@/lib/data";

export const metadata: Metadata = { title: "Competitions" };

export default async function CompetitionsPage() {
  const [sports, competitions] = await Promise.all([getSports(), getCompetitions()]);

  const comingSoon = sports.filter((s) => s.status === "coming_soon");

  return (
    <>
      <PageHeader title="Competitions" subtitle="EKSU leagues and cups" />
      <div className="space-y-7">
        {sports.filter((s) => s.status === "active").map((sport) => {
          const list = competitions.filter((c) => c.sportId === sport.id);
          return (
            <section key={sport.id} aria-labelledby={`sport-${sport.id}`}>
              <h2 id={`sport-${sport.id}`} className="mb-2.5 flex items-center gap-2 px-1 font-display text-xl font-bold">
                {sport.name}
              </h2>
              {list.length > 0 ? (
                <CompetitionLinkList competitions={list} />
              ) : (
                <EmptyState compact icon={<TrophyIcon size={22} />} title="No competitions yet" />
              )}
            </section>
          );
        })}
        {comingSoon.length > 0 && (
          <section aria-labelledby="coming-soon" className="rounded-card border border-dashed border-line-strong bg-surface px-4 py-3.5">
            <h2 id="coming-soon" className="text-xs font-bold tracking-wide text-ink-faint uppercase">
              Coming soon
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{comingSoon.map((s) => s.name).join(" · ")}</p>
          </section>
        )}
      </div>
    </>
  );
}
