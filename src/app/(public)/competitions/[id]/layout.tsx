import { notFound } from "next/navigation";
import { CompetitionBadge, competitionMeta } from "@/components/competition/CompetitionLinkList";
import { BackLink } from "@/components/ui/BackLink";
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
    // Top scorers: every league, plus special-rules competitions.
    ...(competition.format === "league" || competition.regulations ? [{ href: `${base}/scorers`, label: "Scorers" }] : []),
    // Special-rules competitions only: their official Rules & Regulations.
    ...(competition.regulations ? [{ href: `${base}/rules`, label: "Rules" }] : []),
  ];

  return (
    <>
      <div className="pt-2 sm:pt-4">
        <BackLink fallbackHref="/competitions" label="Competitions" />
      </div>
      <div className="flex items-center gap-3 pb-3">
        <CompetitionBadge competition={competition} size={44} />
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-[1.05] font-extrabold tracking-[0.01em] uppercase sm:text-[28px]">
            {competition.name}
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">{competitionMeta(competition)}</p>
        </div>
      </div>
      <LinkTabs label="Competition sections" tabs={tabs} />
      <div className="pt-3 sm:pt-4">{children}</div>
    </>
  );
}
