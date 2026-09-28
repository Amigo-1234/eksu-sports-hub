import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchesByDate } from "@/components/match/MatchList";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarIcon } from "@/components/ui/icons";
import { getCompetition, getMatches, getNow } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/fixtures">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} fixtures` : "Fixtures" };
}

export default async function CompetitionFixtures({ params }: PageProps<"/competitions/[id]/fixtures">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();
  const now = await getNow();
  const matches = await getMatches({ scope: "upcoming", competitionId: id });

  return matches.length > 0 ? (
    <MatchesByDate matches={matches} serverNow={now} />
  ) : (
    <EmptyState
      icon={<CalendarIcon size={22} />}
      title="No upcoming fixtures"
      description={`Nothing else is scheduled in the ${competition.name} yet.`}
      action={{ href: `/competitions/${id}/results`, label: "See results" }}
    />
  );
}
