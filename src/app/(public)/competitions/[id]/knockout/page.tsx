import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KnockoutBracket } from "@/components/competition/KnockoutBracket";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCompetition, getCompetitionDetail } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/knockout">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} knockout` : "Knockout" };
}

export default async function CompetitionKnockout({ params }: PageProps<"/competitions/[id]/knockout">) {
  const { id } = await params;
  const [competition, detail] = await Promise.all([getCompetition(id), getCompetitionDetail(id)]);
  if (!competition) notFound();
  const stages = detail?.stages.filter((s) => s.isKnockout && s.ties.length > 0) ?? [];
  const rounds = stages.filter((s) => s.type !== "THIRD_PLACE").map((s) => ({ id: s.id, name: s.name, ties: s.ties }));
  const third = stages.find((s) => s.type === "THIRD_PLACE")?.ties[0] ?? null;

  if (rounds.length === 0) {
    return (
      <EmptyState
        title="The knockout draw has not been made yet"
        description="Once the bracket is set, every tie appears here — with placeholders such as “Winner Group A” until the teams are known."
        action={{ href: `/competitions/${id}`, label: "Back to overview" }}
      />
    );
  }
  return (
    <>
      <KnockoutBracket rounds={rounds} thirdPlace={third} />
      <p className="mt-4 px-1 text-xs text-ink-faint">
        Level knockout matches go to extra time and penalties where the competition rules allow. Shoot-out goals are shown in brackets and never count as goals.
      </p>
    </>
  );
}
