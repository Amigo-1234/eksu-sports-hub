import Link from "next/link";
import { BallIcon } from "@/components/ui/icons";
import type { TopScorer } from "@/lib/types";

/**
 * Golden Boot race: the leading scorers in a competition (live and completed
 * matches; own goals excluded), with a link to the full list.
 */
export function TopScorersCard({
  rows,
  competitionId,
  competitionName,
  limit = 5,
}: {
  rows: TopScorer[];
  competitionId: string;
  competitionName: string;
  limit?: number;
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, limit);
  const tied = (rank: number) => rows.filter((r) => r.rank === rank).length > 1;

  return (
    <section aria-labelledby="top-scorers" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle/70 px-3 py-2">
        <h2 id="top-scorers" className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.02em] text-ink uppercase">
          <BallIcon size={14} className="text-brand-fg" />
          Top scorers
        </h2>
        <Link href={`/competitions/${competitionId}/scorers`} className="text-xs font-bold text-brand-fg hover:underline">
          All scorers
        </Link>
      </div>
      <ol aria-label={`${competitionName} top scorers`} className="divide-y divide-line">
        {shown.map((r, i) => (
          <li key={`${r.teamId}-${r.playerName}-${i}`} className="flex items-center gap-3 px-3 py-2">
            <span
              className={`inline-grid h-6 min-w-6 shrink-0 place-items-center rounded px-1 text-[12px] font-bold tabular-nums ${
                r.rank === 1 ? "bg-accent-400 text-brand-900" : "text-ink-muted"
              }`}
            >
              {tied(r.rank) ? `=${r.rank}` : r.rank}
            </span>
            <span className="min-w-0 flex-1">
              <Link href={`/teams/${r.teamId}`} className="block truncate text-sm font-semibold hover:text-brand-fg">
                {r.playerName ?? "Unnamed player"}
              </Link>
              <span className="block truncate text-xs text-ink-muted">{r.teamName}</span>
            </span>
            <span className="shrink-0 font-display text-[18px] font-extrabold tabular-nums">
              {r.goals}
              <span className="sr-only"> {r.goals === 1 ? "goal" : "goals"}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
