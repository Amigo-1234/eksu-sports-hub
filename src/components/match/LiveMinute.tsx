"use client";

import { useSyncExternalStore } from "react";
import { onServerTimeChange, serverNow as deviceServerNow } from "@/lib/realtime/serverTime";
import { computeMatchClock, computePublicClock, formatMinute } from "@/lib/status";
import type { MatchStatus, PublicClock } from "@/lib/types";

/*
 * A shared, low-frequency clock. The minute is always derived from server
 * timestamps (period start, pauses, offsets) and the server-time offset —
 * never from a counter that could drift.
 */
const TICK_MS = 5_000;
let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let offsetUnsub: (() => void) | null = null;

const emit = () => {
  current = deviceServerNow();
  listeners.forEach((l) => l());
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = deviceServerNow();
    timer = setInterval(emit, TICK_MS);
    offsetUnsub = onServerTimeChange(emit);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      offsetUnsub?.();
      offsetUnsub = null;
    }
  };
}

export function LiveMinute({
  status,
  periodStartedAt,
  clock,
  serverNow,
  className = "",
}: {
  status: MatchStatus;
  periodStartedAt: string | null;
  /** Authoritative clock (real data). Falls back to `periodStartedAt` (demo data). */
  clock?: PublicClock | null;
  /** Request time from the server, used for the first (hydrated) render. */
  serverNow: number;
  className?: string;
}) {
  const now = useSyncExternalStore(
    subscribe,
    () => current || serverNow,
    () => serverNow,
  );
  const live = clock ? computePublicClock(status, clock, now) : computeMatchClock(status, periodStartedAt, now);
  if (!live) return null;
  const text = formatMinute(live.minute, live.addedTime);
  const paused = "paused" in live && live.paused;
  return (
    <span className={`tabular-nums ${className}`}>
      {text.slice(0, -1)}
      <span className={paused ? "" : "motion-safe:animate-pulse"} aria-hidden="true">
        &apos;
      </span>
      <span className="sr-only">minutes{paused ? ", play paused" : ""}</span>
    </span>
  );
}
