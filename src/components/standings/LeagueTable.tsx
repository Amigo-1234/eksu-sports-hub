"use client";

import { useState, type ComponentProps } from "react";
import { StandingsTable } from "./StandingsTable";
import type { StandingRow } from "@/lib/types";

type View = "overall" | "home" | "away";
const LABEL: Record<View, string> = { overall: "Overall", home: "Home", away: "Away" };

/** Overall / Home / Away tabs over one league table (Flashscore-style). */
export function LeagueTable({
  home,
  away,
  ...table
}: ComponentProps<typeof StandingsTable> & { home: StandingRow[]; away: StandingRow[] }) {
  const [view, setView] = useState<View>("overall");
  const rows = view === "overall" ? table.rows : view === "home" ? home : away;
  return (
    <div>
      <div role="group" aria-label="Table view" className="mb-2 flex gap-1.5">
        {(Object.keys(LABEL) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`h-8 rounded-full px-3.5 text-[13px] font-bold transition-colors ${
              view === v ? "bg-ink text-canvas" : "border border-line bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {LABEL[v]}
          </button>
        ))}
      </div>
      <StandingsTable
        {...table}
        rows={rows}
        caption={view === "overall" ? table.caption : `${table.caption} (${LABEL[view].toLowerCase()} matches)`}
        promotionSpots={view === "overall" ? table.promotionSpots : 0}
      />
    </div>
  );
}
