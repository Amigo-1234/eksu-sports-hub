"use client";

import { BellIcon } from "@/components/ui/icons";
import { effectiveMatchPrefs } from "@/lib/notifications/prefs";
import type { MatchStatus } from "@/lib/types";
import { useAlerts } from "./AlertsProvider";

/** Quiet marker on match cards this device gets alerts for (not interactive: cards are links). */
export function FollowedBell({ matchId, teamIds, status, className = "" }: { matchId: string; teamIds: string[]; status: MatchStatus; className?: string }) {
  const alerts = useAlerts();
  if (!alerts.available || !alerts.pushOn || status === "FULL_TIME" || status === "CANCELLED" || status === "ABANDONED") return null;
  const eff = effectiveMatchPrefs(alerts.state, matchId, teamIds);
  if (!eff.enabled || eff.events.length === 0) return null;
  return (
    <span className={`inline-flex text-brand-700 ${className}`} data-testid="followed-bell">
      <BellIcon size={12} filled />
      <span className="sr-only">Alerts on</span>
    </span>
  );
}
