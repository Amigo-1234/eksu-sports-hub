import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchesByDate } from "@/components/match/MatchList";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResultsIcon } from "@/components/ui/icons";
import { getCompetition, getMatches, getNow } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/results">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} results` : "Results" };
}

export default async function CompetitionResults({ params }: PageProps<"/competitions/[id]/results">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();
  const now = await getNow();
  const matches = await getMatches({ scope: "results", competitionId: id });

  return matches.length > 0 ? (
    <MatchesByDate matches={matches} serverNow={now} />
  ) : (
    <EmptyState
      icon={<ResultsIcon size={22} />}
      title="No results yet"
      description={`No ${competition.name} matches have finished yet.`}
      action={{ href: `/competitions/${id}/fixtures`, label: "See fixtures" }}
    />
  );
}
