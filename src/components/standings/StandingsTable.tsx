import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { FormGuide } from "@/components/team/FormGuide";
import { matchHref } from "@/lib/match";
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
  title,
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
  /** Optional visible title bar (e.g. the competition name on a preview). */
  title?: string;
}) {
  const cols = compact ? COLS.filter((c) => c.key === "played" || c.key === "goalDifference") : COLS;
  const isLiveTable = rows.some((r) => r.live);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {isLiveTable && (
        <p className="border-b border-line bg-live/8 px-3 py-2 text-[12px] leading-snug text-ink-muted">
          <span className="mr-1.5 inline-flex items-center gap-1.5 font-bold text-ink">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-live" />
            </span>
            Live table
          </span>
          Matches in progress count at the current score.
        </p>
      )}
      {title && (
        <p className="truncate border-b border-line bg-subtle/70 px-3 py-2 text-[12px] font-bold tracking-[0.02em] text-ink uppercase" aria-hidden="true">
          {title}
        </p>
      )}
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
          <tr className="border-b border-line text-[11px] font-bold tracking-wide text-ink-faint uppercase">
            <th scope="col" className="py-2 text-center">
              <abbr title="Position" className="no-underline">#</abbr>
            </th>
            <th scope="col" className="py-2 pl-1 text-left">Team</th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`py-2 text-center ${c.cls}`}>
                <abbr title={c.title} className="no-underline">{c.abbr}</abbr>
              </th>
            ))}
            <th scope="col" className="py-2 pr-2 text-center text-ink-muted">
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
              <tr key={r.teamId} className={highlighted ? "bg-accent-100" : "hover:bg-subtle/60"}>
                <td className="relative py-2 text-center tabular-nums">
                  <span
                    className={`inline-grid size-6 place-items-center rounded text-[12px] font-bold ${
                      promoted ? "bg-brand-700 text-white" : "text-ink-muted"
                    }`}
                  >
                    {r.position}
                  </span>
                  {promoted && promotionLabel && <span className="sr-only">, {promotionLabel}</span>}
                  {r.movement ? <Movement places={r.movement} /> : null}
                </td>
                <th scope="row" className="py-1.5 pl-1 text-left font-normal">
                  <Link
                    href={`/teams/${r.teamId}`}
                    className="flex min-w-0 items-center gap-2 rounded py-1 hover:text-brand-fg"
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
                  {r.live && <LiveChip live={r.live} />}
                </th>
                {cols.map((c) => {
                  const v = r[c.key];
                  return (
                    <td key={c.key} className={`py-2 text-center tabular-nums text-ink-muted ${c.cls}`}>
                      {c.key === "goalDifference" && v > 0 ? `+${v}` : v}
                    </td>
                  );
                })}
                <td className="py-2 pr-2 text-center font-display text-[17px] font-bold tabular-nums text-ink">
                  {r.points}
                </td>
                {showForm && !compact && (
                  <td className="hidden py-2 pr-3 lg:table-cell">
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
          <span className="size-3 rounded-sm bg-brand-700" aria-hidden="true" />
          {promotionLabel}
        </p>
      )}
    </div>
  );
}

/** Places gained (green, up) or lost (red, down) on the live table. */
function Movement({ places }: { places: number }) {
  const up = places > 0;
  return (
    <span
      className={`absolute top-1/2 right-0 -translate-y-1/2 text-[9px] leading-none font-black ${up ? "text-win" : "text-loss"}`}
      title={`${up ? "Up" : "Down"} ${Math.abs(places)} on the live table`}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">
        , {up ? "up" : "down"} {Math.abs(places)} {Math.abs(places) === 1 ? "place" : "places"} live
      </span>
    </span>
  );
}

const OUTCOME = {
  W: { label: "winning", cls: "bg-win text-canvas" },
  D: { label: "drawing", cls: "bg-ink-muted text-canvas" },
  L: { label: "losing", cls: "bg-loss text-canvas" },
} as const;

/** "LIVE 2–1" under the team name: the match it is playing now and the current score. */
function LiveChip({ live }: { live: NonNullable<StandingRow["live"]> }) {
  const o = OUTCOME[live.outcome];
  return (
    <Link
      href={matchHref(live.matchId)}
      className={`ml-8 inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-bold tracking-wide whitespace-nowrap tabular-nums ${o.cls}`}
    >
      <span className="size-1.5 rounded-full bg-canvas motion-safe:animate-pulse" aria-hidden="true" />
      LIVE {live.goalsFor}–{live.goalsAgainst}
      <span className="sr-only">, currently {o.label}</span>
    </Link>
  );
}
