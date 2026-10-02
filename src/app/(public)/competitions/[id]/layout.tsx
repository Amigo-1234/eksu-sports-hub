import { notFound } from "next/navigation";
import { CompetitionBadge, competitionMeta } from "@/components/competition/CompetitionLinkList";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { getCompetition, getCompetitionDetail } from "@/lib/data";
import { competitionSections } from "@/lib/competitionSections";

export default async function CompetitionLayout({ children, params }: LayoutProps<"/competitions/[id]">) {
  const { id } = await params;
  const [competition, detail] = await Promise.all([getCompetition(id), getCompetitionDetail(id)]);
  if (!competition) notFound();

  const base = `/competitions/${competition.id}`;
  // Only the sections that make sense for this competition's format.
  const tabs = competitionSections(competition, detail).map((s) => ({ href: `${base}${s.path}`, label: s.label }));

  return (
    <>
      <div className="flex items-center gap-3 pt-4 pb-3 sm:pt-6">
        <CompetitionBadge competition={competition} size={48} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">
            {competition.name}
          </h1>
          <p className="text-sm text-ink-muted">{competitionMeta(competition)}</p>
        </div>
      </div>
      <LinkTabs label="Competition sections" tabs={tabs} />
      <div className="pt-4">{children}</div>
    </>
  );
}
