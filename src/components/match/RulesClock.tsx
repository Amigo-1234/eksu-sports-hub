"use client";

import { useSyncExternalStore } from "react";
import { serverNow as deviceServerNow } from "@/lib/realtime/serverTime";
import { formatCountdown, halftimeRemaining } from "@/lib/rules/special";
import { publicActiveSeconds } from "@/lib/status";
import type { MatchStatus, PublicClock } from "@/lib/types";

/*
 * Second-by-second countdowns for special competition rules (temporary red
 * cards, timed half-time break). Derived from server timestamps — never a
 * local counter — and only mounted where such rules apply.
 */
let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = deviceServerNow();
    timer = setInterval(() => {
      current = deviceServerNow();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const useSecondTick = () => useSyncExternalStore(subscribe, () => current || Date.now(), () => 0);

/** "⏱ 0:42" while a suspension is being served; "Can return" once served (the referee decides). */
export function SuspensionBadge({ clock, endsActive }: { clock: PublicClock | null | undefined; endsActive: number | null | undefined }) {
  const now = useSecondTick();
  const active = now ? publicActiveSeconds(clock, now) : null;
  const left = endsActive == null || active === null ? null : Math.max(0, endsActive - active);
  return (
    <span className="inline-flex items-center gap-1 rounded bg-live px-1.5 py-px text-[11px] font-bold text-white tabular-nums">
      {left === null ? "Suspended" : left > 0 ? <>⏱ {formatCountdown(left)}<span className="sr-only"> of suspension left</span></> : "Can return"}
    </span>
  );
}

/** "2nd half in 0:42" during a timed half-time break (the referee restarts play). */
export function HalftimeCountdown({ status, clock, prefix = "" }: { status: MatchStatus; clock: PublicClock | null | undefined; prefix?: string }) {
  const now = useSecondTick();
  if (status !== "HALF_TIME" || !clock?.rules?.halftimeSeconds || !now) return null;
  const left = halftimeRemaining(clock.rules, clock.periodEndedAt ? Date.parse(clock.periodEndedAt) : null, now);
  if (left === null) return null;
  return (
    <span className="tabular-nums" role="status">
      {prefix}
      {left > 0 ? `2nd half in ${formatCountdown(left)}` : "2nd half about to start"}
    </span>
  );
}
