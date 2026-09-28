import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchHero } from "@/components/match/MatchHero";
import { HeadToHeadPanel, NotAvailablePanel, SummaryPanel, type PreMatchTeam } from "@/components/match/MatchPanels";
import { MatchTabs } from "@/components/match/MatchTabs";
import { BackLink } from "@/components/ui/BackLink";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { getHeadToHead, getMatch, getMatches, getNow, getStandings } from "@/lib/data";
import { outcomeFor } from "@/lib/match";
import { showsScore } from "@/lib/status";
import type { FormResult, StandingRow, Team } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/matches/[id]">): Promise<Metadata> {
  const m = await getMatch((await params).id);
  if (!m) return { title: "Match not found" };
  const mid = showsScore(m.status) && m.score ? `${m.score.home}–${m.score.away}` : "v";
  return { title: `${m.homeTeam.shortName} ${mid} ${m.awayTeam.shortName}` };
}

async function recentForm(teamId: string): Promise<FormResult[]> {
  const results = await getMatches({ scope: "results", teamId });
  return results
    .filter((m) => m.status === "FULL_TIME")
    .slice(0, 5)
    .reverse()
    .map((m) => ({ matchId: m.id, outcome: outcomeFor(m, teamId)! }));
}

export default async function MatchPage({ params }: PageProps<"/matches/[id]">) {
  const { id } = await params;
  const match = await getMatch(id);
  if (!match) notFound();

  const now = await getNow();
  const [meetings, homeForm, awayForm, standings] = await Promise.all([
    getHeadToHead(match.homeTeamId, match.awayTeamId, { excludeMatchId: match.id, limit: 10 }),
    recentForm(match.homeTeamId),
    recentForm(match.awayTeamId),
    getStandings(match.competitionId),
  ]);

  const pre = (team: Team, form: FormResult[]): PreMatchTeam => ({
    team,
    form,
    standing: standings.find((s: StandingRow) => s.teamId === team.id),
  });

  return (
    <div className="pt-2 sm:pt-4">
      <BackLink />
      <MatchHero match={match} serverNow={now} />
      <div className="mt-2">
        <MatchTabs
          tabs={[
            {
              id: "summary",
              label: "Summary",
              content: (
                <SummaryPanel
                  match={match}
                  preMatch={{ home: pre(match.homeTeam, homeForm), away: pre(match.awayTeam, awayForm) }}
                />
              ),
            },
            { id: "lineups", label: "Line-ups", content: <NotAvailablePanel kind="lineups" /> },
            { id: "stats", label: "Stats", content: <NotAvailablePanel kind="stats" /> },
            { id: "h2h", label: "H2H", content: <HeadToHeadPanel match={match} meetings={meetings} serverNow={now} /> },
          ]}
        />
      </div>
      <DemoNotice />
    </div>
  );
}
