import type { Metadata } from "next";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { LiveMatchCard } from "@/components/admin/LiveMatchCard";
import { Card, Empty, PageTitle } from "@/components/admin/ui";
import { getMatchAudience, listLiveMatches } from "@/lib/admin/data/matches";
import { serverNow } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Live Matches" };

/** Monitoring only — actions happen on the match page, never as a second operator console. */
export default async function LivePage() {
  const live = await listLiveMatches();
  const audience = await Promise.all(live.map((m) => getMatchAudience(m.match.id)));
  const now = serverNow();
  return (
    <>
      <PageTitle
        title="Live Matches"
        description="Every match in progress. Last activity turns amber after 10 minutes without any recorded action."
        actions={<AutoRefresh seconds={15} />}
      />
      {live.length === 0 ? (
        <Card>
          <Empty title="No matches are live">This page refreshes automatically.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((m, i) => (
            <LiveMatchCard key={m.match.id} m={m} now={now} audience={audience[i]} />
          ))}
        </div>
      )}
    </>
  );
}
