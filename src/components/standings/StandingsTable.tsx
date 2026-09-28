import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { FormGuide } from "@/components/team/FormGuide";
import type { StandingRow } from "@/lib/types";

/*
 * Column visibility by breakpoint — narrow phones keep #, team, P, GD, PTS.
 *   base: P GD PTS   ≥370px: + W D L   md: + GF GA   lg: + form
 */
const COLS = [
  { key: "played", abbr: "P", title: "Played", cls: "", colCls: "" },
  { key: "won", abbr: "W", title: "Won", cls: "hidden min-[370px]:table-cell", colCls: "hidden min-[370px]:table-column" },
  { key: "drawn", abbr: "D", title: "Drawn", cls: "hidden min-[370px]:table-cell", colCls: "hidden min-[370px]:table-column" },
  { key: "lost", abbr: "L", title: "Lost", cls: "hidden min-[370px]:table-cell", colCls: "hidden min-[370px]:table-column" },
  { key: "goalsFor", abbr: "GF", title: "Goals for", cls: "hidden md:table-cell", colCls: "hidden md:table-column" },
  { key: "goalsAgainst", abbr: "GA", title: "Goals against", cls: "hidden md:table-cell", colCls: "hidden md:table-column" },
  { key: "goalDifference", abbr: "GD", title: "Goal difference", cls: "", colCls: "" },
] as const;

export function StandingsTable({
  rows,
  caption,
  highlightTeamIds = [],
  promotionSpots = 0,
  promotionLabel,
  compact = false,
  showForm = true,
}: {
  rows: StandingRow[];
  caption: string;
  highlightTeamIds?: string[];
  /** Number of top positions to mark (e.g. final qualification). */
  promotionSpots?: number;
  promotionLabel?: string;
  /** Preview mode: fewer columns regardless of width. */
  compact?: boolean;
  showForm?: boolean;
}) {
  const cols = compact ? COLS.filter((c) => c.key === "played" || c.key === "goalDifference") : COLS;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-10" />
          <col />
          {cols.map((c) => (
            <col key={c.key} className={`${c.key === "goalDifference" ? "w-11" : "w-9"} ${c.colCls}`} />
          ))}
          <col className="w-12" />
          {showForm && !compact && <col className="hidden w-36 lg:table-column" />}
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-subtle/60 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
            <th scope="col" className="py-2 text-center">
              <abbr title="Position" className="no-underline">#</abbr>
            </th>
            <th scope="col" className="py-2 pl-1 text-left">Team</th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`py-2 text-center ${c.cls}`}>
                <abbr title={c.title} className="no-underline">{c.abbr}</abbr>
              </th>
            ))}
            <th scope="col" className="py-2 pr-2 text-center text-ink">
              <abbr title="Points" className="no-underline">Pts</abbr>
            </th>
            {showForm && !compact && (
              <th scope="col" className="hidden py-2 pr-3 text-left lg:table-cell">Form</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const highlighted = highlightTeamIds.includes(r.teamId);
            const promoted = r.position <= promotionSpots;
            return (
              <tr key={r.teamId} className={highlighted ? "bg-accent-100/60" : "hover:bg-subtle/60"}>
                <td className="relative py-2.5 text-center font-semibold tabular-nums text-ink-muted">
                  {promoted && (
                    <span className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-brand-600" aria-hidden="true" />
                  )}
                  {r.position}
                  {promoted && promotionLabel && <span className="sr-only">, {promotionLabel}</span>}
                </td>
                <th scope="row" className="py-1.5 pl-1 text-left font-normal">
                  <Link
                    href={`/teams/${r.teamId}`}
                    className="flex min-w-0 items-center gap-2 rounded py-1 hover:text-brand-700"
                  >
                    <TeamCrest team={r.team} size="sm" />
                    <span className={`truncate ${highlighted ? "font-bold" : "font-semibold"}`}>
                      {compact ? r.team.shortName : (
                        <>
                          <span className="md:hidden">{r.team.shortName}</span>
                          <span className="hidden md:inline">{r.team.name}</span>
                        </>
                      )}
                    </span>
                  </Link>
                </th>
                {cols.map((c) => {
                  const v = r[c.key];
                  return (
                    <td key={c.key} className={`py-2.5 text-center tabular-nums text-ink-muted ${c.cls}`}>
                      {c.key === "goalDifference" && v > 0 ? `+${v}` : v}
                    </td>
                  );
                })}
                <td className="py-2.5 pr-2 text-center font-display text-base font-bold tabular-nums">
                  {r.points}
                </td>
                {showForm && !compact && (
                  <td className="hidden py-2.5 pr-3 lg:table-cell">
                    <FormGuide form={r.form} size="sm" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {promotionSpots > 0 && promotionLabel && !compact && (
        <p className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink-muted">
          <span className="h-3 w-[3px] rounded bg-brand-600" aria-hidden="true" />
          {promotionLabel}
        </p>
      )}
    </div>
  );
}
