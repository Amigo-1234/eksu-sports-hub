import { notFound } from "next/navigation";
import { CompetitionBadge, competitionMeta } from "@/components/competition/CompetitionLinkList";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { getCompetition } from "@/lib/data";

export default async function CompetitionLayout({ children, params }: LayoutProps<"/competitions/[id]">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const base = `/competitions/${competition.id}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/fixtures`, label: "Fixtures" },
    { href: `${base}/results`, label: "Results" },
    ...(competition.format === "league" ? [{ href: `${base}/table`, label: "Table" }] : []),
    // Special-rules competitions only: their official Rules & Regulations.
    ...(competition.regulations ? [{ href: `${base}/rules`, label: "Rules" }] : []),
  ];

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
