"use client";

import { useSyncExternalStore } from "react";
import { computeMatchClock, formatMinute } from "@/lib/status";
import type { MatchStatus } from "@/lib/types";

/*
 * A shared, low-frequency clock. This only advances the displayed minute
 * between page loads, computed from when the period started — it does not
 * fetch new scores or events.
 */
const TICK_MS = 15_000;
let current = typeof window === "undefined" ? 0 : Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function LiveMinute({
  status,
  periodStartedAt,
  serverNow,
  className = "",
}: {
  status: MatchStatus;
  periodStartedAt: string | null;
  /** Request time from the server, used for the first (hydrated) render. */
  serverNow: number;
  className?: string;
}) {
  const now = useSyncExternalStore(
    subscribe,
    () => current || serverNow,
    () => serverNow,
  );
  const clock = computeMatchClock(status, periodStartedAt, now);
  if (!clock) return null;
  const text = formatMinute(clock.minute, clock.addedTime);
  return (
    <span className={`tabular-nums ${className}`}>
      {text.slice(0, -1)}
      <span className="motion-safe:animate-pulse" aria-hidden="true">
        &apos;
      </span>
      <span className="sr-only">minutes</span>
    </span>
  );
}
