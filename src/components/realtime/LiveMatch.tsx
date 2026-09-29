"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MatchHero } from "@/components/match/MatchHero";
import { LineupsPanel } from "@/components/match/LineupsPanel";
import { NotAvailablePanel, SummaryPanel, type PreMatchTeam } from "@/components/match/MatchPanels";
import { onResume, publicClient, subscribeHints } from "@/lib/realtime/client";
import { applyFeed, knownSeq, shouldFetch } from "@/lib/realtime/matchSync";
import { setServerTime } from "@/lib/realtime/serverTime";
import { isLive } from "@/lib/status";
import type { MatchDetail } from "@/lib/types";

const MatchCtx = createContext<MatchDetail | null>(null);
const SAFETY_POLL_MS = 30_000;

/**
 * Keeps one match current: subscribes to `match:{id}` only, and on every
 * hint / reconnect / resume fetches the canonical state after the last known
 * seq. The server-rendered match is the starting point (deep links always
 * open on the latest score).
 */
export function LiveMatchProvider({
  initial,
  enabled,
  children,
}: {
  initial: MatchDetail;
  enabled: boolean;
  children: ReactNode;
}) {
  const [match, setMatch] = useState(initial);

  useEffect(() => {
    if (!enabled) return;
    let current = initial;
    let busy = false;
    let pending: "none" | "delta" | "full" = "none";
    let cancelled = false;

    const resync = async (full = false): Promise<void> => {
      const c = publicClient();
      if (!c || cancelled) return;
      if (busy) {
        if (full || pending === "none") pending = full ? "full" : "delta";
        return;
      }
      busy = true;
      try {
        const sentAt = Date.now();
        const { data, error } = await c.rpc("public_match_feed", {
          p_match_id: current.id,
          p_after_seq: full ? 0 : knownSeq(current),
        });
        if (error || !data || cancelled) return;
        setServerTime(data.server_time, sentAt);
        const result = applyFeed(full ? { ...current, events: [] } : current, data);
        if (result.kind === "stale") return;
        if (result.kind === "inconsistent" && !full) {
          pending = "full"; // canonical score disagrees with our events: start over
          return;
        }
        current = result.match;
        setMatch(result.match);
      } finally {
        busy = false;
        if (pending !== "none") {
          const next = pending;
          pending = "none";
          void resync(next === "full");
        }
      }
    };

    const unsubscribe = subscribeHints(
      `match:${initial.id}`,
      (hint) => {
        if (hint.match_id === current.id && shouldFetch(current, hint.seq)) void resync();
      },
      (state) => {
        // Fresh subscription or reconnect: catch up on anything missed.
        if (state === "live") void resync();
      },
    );
    const stopResume = onResume(() => void resync());
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && (isLive(current.status) || current.status === "SCHEDULED")) void resync();
    }, SAFETY_POLL_MS);
    return () => {
      cancelled = true;
      unsubscribe();
      stopResume();
      clearInterval(poll);
    };
  }, [enabled, initial]);

  return <MatchCtx.Provider value={match}>{children}</MatchCtx.Provider>;
}

function useLiveMatch(): MatchDetail {
  const m = useContext(MatchCtx);
  if (!m) throw new Error("LiveMatchProvider missing");
  return m;
}

export function LiveMatchHero({ serverNow }: { serverNow: number }) {
  return <MatchHero match={useLiveMatch()} serverNow={serverNow} />;
}

export function LiveSummaryPanel({ preMatch }: { preMatch: { home: PreMatchTeam; away: PreMatchTeam } }) {
  return <SummaryPanel match={useLiveMatch()} preMatch={preMatch} />;
}

/** Line-ups tab: updates with the same realtime resync as the score (substitutions, dismissals, publication). */
export function LiveLineupsPanel() {
  const match = useLiveMatch();
  // Undefined: the data source has no line-ups (demo data).
  return match.lineups === undefined ? <NotAvailablePanel kind="lineups" /> : <LineupsPanel match={match} />;
}
