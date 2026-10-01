"use client";

import { useEffect, useState } from "react";
import { refreshMatchAudience } from "@/lib/admin/actions/audience";
import type { AudienceSummary } from "@/lib/audience/types";
import { formatWatDateTime } from "@/lib/admin/time";

/** Private match audience. Polls every 15 s while the match is live and the tab is visible. */
export function AudiencePanel({ matchId, initial, live }: { matchId: string; initial: AudienceSummary | null; live: boolean }) {
  const [a, setA] = useState(initial);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const next = await refreshMatchAudience(matchId).catch(() => null);
      if (next) setA(next);
    }, 15_000);
    return () => clearInterval(t);
  }, [live, matchId]);

  if (!a) return <p className="text-sm text-ink-muted">Audience figures are unavailable right now.</p>;
  const rows: [string, number, string][] = [
    ["Watching now", a.watching_now, "watching"],
    ["Peak viewers", a.peak_viewers, "peak"],
    ["Unique viewers", a.unique_viewers, "unique"],
    ["Total visits", a.total_visits, "visits"],
  ];
  return (
    <div data-testid="admin-audience">
      <dl className="grid grid-cols-2 gap-2">
        {rows.map(([label, value, key]) => (
          <div key={key} className="min-w-0 rounded-lg bg-subtle px-3 py-2">
            <dt className="truncate text-xs font-semibold text-ink-muted">{label}</dt>
            <dd className="font-display text-2xl leading-tight font-extrabold tabular-nums" data-testid={`audience-${key}`}>
              {value.toLocaleString("en-NG")}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-faint">
        {a.peak_at ? `Peak reached ${formatWatDateTime(a.peak_at)}. ` : ""}
        Anonymous devices; watching now = seen in the last {a.active_window_seconds} s. Private to staff — never shown publicly.
      </p>
    </div>
  );
}
