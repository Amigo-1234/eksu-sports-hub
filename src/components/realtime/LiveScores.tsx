"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isClockRunning } from "@/lib/status";
import { toEvent, toPublicClock, toPublicStatus } from "@/lib/data/supabase/map";
import { onResume, publicClient, subscribeHints } from "@/lib/realtime/client";
import { setServerTime } from "@/lib/realtime/serverTime";
import type { MatchEvent, MatchStatus, PublicClock, Score } from "@/lib/types";

export interface LiveScore {
  status: MatchStatus;
  score: Score;
  clock: PublicClock | null;
  periodStartedAt: string | null;
  seq: number;
  lastEvent: MatchEvent | null;
}

const ScoresCtx = createContext<ReadonlyMap<string, LiveScore>>(new Map());
const SAFETY_POLL_MS = 30_000;
const DEBOUNCE_MS = 250;

/* eslint-disable @typescript-eslint/no-explicit-any -- RPC payload is mapped explicitly below. */

/**
 * Live score board for Home and /live. Listens to `scores:live`; any hint
 * newer than what is shown (or a reconnect / resume / safety poll) refetches
 * `public_live_scores`. Scores, clocks and last events update in place; when
 * the set of live matches changes (kick-off, full-time) the server lists are
 * re-rendered with router.refresh().
 */
export function LiveScoresProvider({
  enabled,
  renderedLiveIds,
  children,
}: {
  enabled: boolean;
  renderedLiveIds: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<ReadonlyMap<string, LiveScore>>(new Map());
  const seqs = useRef(new Map<string, number>());
  const renderedKey = useMemo(() => [...renderedLiveIds].sort().join(","), [renderedLiveIds]);
  const renderedRef = useRef(renderedKey);
  const refreshedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    renderedRef.current = renderedKey;
  }, [renderedKey]);

  const fetchBoard = useCallback(async () => {
    const c = publicClient();
    if (!c || inFlight.current) return;
    inFlight.current = true;
    try {
      const sentAt = Date.now();
      const { data, error } = await c.rpc("public_live_scores");
      if (error || !data) return;
      setServerTime(data.server_time, sentAt);
      const next = new Map<string, LiveScore>();
      for (const m of data.matches as any[]) {
        const seq = Number(m.seq ?? 0);
        if (seq < (seqs.current.get(m.id) ?? 0)) continue; // never go backwards
        seqs.current.set(m.id, seq);
        const status = toPublicStatus(m.status);
        next.set(m.id, {
          status,
          score: { home: Number(m.home_score), away: Number(m.away_score) },
          clock: toPublicClock(m),
          periodStartedAt: isClockRunning(status) ? m.period_started_at : null,
          seq,
          lastEvent: m.last_event ? toEvent(m.last_event, m.id) : null,
        });
      }
      setScores(next);
      const liveKey = [...next.keys()].sort().join(",");
      if (liveKey !== renderedRef.current && refreshedFor.current !== liveKey) {
        refreshedFor.current = liveKey; // one refresh per distinct live set
        router.refresh();
      }
    } finally {
      inFlight.current = false;
    }
  }, [router]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void fetchBoard(), DEBOUNCE_MS);
  }, [fetchBoard]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeHints(
      "scores:live",
      (hint) => {
        const known = seqs.current.get(hint.match_id);
        if (known === undefined || hint.seq > known) schedule(); // duplicates ignored
      },
      (state) => {
        if (state === "live") schedule(); // first subscribe or reconnect: catch up
      },
    );
    const stopResume = onResume(schedule);
    const poll = setInterval(() => document.visibilityState === "visible" && schedule(), SAFETY_POLL_MS);
    return () => {
      unsubscribe();
      stopResume();
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, schedule]);

  return <ScoresCtx.Provider value={scores}>{children}</ScoresCtx.Provider>;
}

export const useLiveScore = (matchId: string): LiveScore | undefined => useContext(ScoresCtx).get(matchId);
