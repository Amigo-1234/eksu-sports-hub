import type { Metadata } from "next";
import { CompetitionMatchGroup, MatchesByDate } from "@/components/match/MatchList";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LiveIcon } from "@/components/ui/icons";
import { LiveScoresProvider } from "@/components/realtime/LiveScores";
import { DATA_SOURCE_KIND, getMatches, getNow } from "@/lib/data";
import { groupByCompetition } from "@/lib/grouping";

export const metadata: Metadata = { title: "Live" };

export default async function LivePage() {
  const now = await getNow();
  const live = await getMatches({ scope: "live" });

  if (live.length === 0) {
    const next = (await getMatches({ scope: "upcoming" }))
      .filter((m) => m.status === "SCHEDULED")
      .slice(0, 3);
    return (
      <LiveScoresProvider enabled={DATA_SOURCE_KIND === "live"} renderedLiveIds={[]}>
        <div className="mx-auto max-w-3xl">
        <PageHeader title="Live" subtitle="Matches in progress" actions={<RefreshButton />} />
        <EmptyState
          icon={<LiveIcon size={18} />}
          title="No live matches right now"
          description="Check back at kick-off — here's what's coming up next."
          action={{ href: "/fixtures", label: "See all fixtures" }}
        />
        {next.length > 0 && (
          <section aria-labelledby="next-up" className="mt-5">
            <SectionHeader id="next-up" title="Next up" href="/fixtures" linkLabel="Fixtures" />
            <MatchesByDate matches={next} serverNow={now} />
          </section>
        )}
        <DemoNotice />
        </div>
      </LiveScoresProvider>
    );
  }

  return (
    <LiveScoresProvider enabled={DATA_SOURCE_KIND === "live"} renderedLiveIds={live.map((m) => m.id)}>
      <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Live"
        subtitle={`${live.length} ${live.length === 1 ? "match" : "matches"} in progress`}
        actions={<RefreshButton />}
      />
      <div className="space-y-2.5">
        {groupByCompetition(live).map((g) => (
          <CompetitionMatchGroup key={g.competition.id} group={g} serverNow={now} headingLevel={2} />
        ))}
      </div>
      <DemoNotice />
      </div>
    </LiveScoresProvider>
  );
}
