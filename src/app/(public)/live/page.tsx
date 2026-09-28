import type { Metadata } from "next";
import { LiveMatchCard } from "@/components/match/LiveMatchCard";
import { MatchesByDate } from "@/components/match/MatchList";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LiveIcon } from "@/components/ui/icons";
import { getMatches, getNow } from "@/lib/data";
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
      <>
        <PageHeader title="Live" subtitle="Matches in progress" actions={<RefreshButton />} />
        <EmptyState
          icon={<LiveIcon size={22} />}
          title="No matches live right now"
          description="Check back at kick-off. Here's what's coming up next."
          action={{ href: "/fixtures", label: "See all fixtures" }}
        />
        {next.length > 0 && (
          <section aria-labelledby="next-up" className="mt-7">
            <SectionHeader id="next-up" title="Next up" href="/fixtures" linkLabel="Fixtures" />
            <MatchesByDate matches={next} serverNow={now} />
          </section>
        )}
        <DemoNotice />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Live"
        subtitle={`${live.length} ${live.length === 1 ? "match" : "matches"} in progress`}
        actions={<RefreshButton />}
      />
      <div className="space-y-6">
        {groupByCompetition(live).map((g) => (
          <section key={g.competition.id} aria-labelledby={`live-${g.competition.id}`}>
            <h2
              id={`live-${g.competition.id}`}
              className="mb-2 px-1 text-xs font-bold tracking-wide text-ink-muted uppercase"
            >
              {g.competition.name}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.matches.map((m) => (
                <li key={m.id}>
                  <LiveMatchCard match={m} serverNow={now} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <DemoNotice />
    </>
  );
}
