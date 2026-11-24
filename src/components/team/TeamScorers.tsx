import Link from "next/link";
import { BallIcon } from "@/components/ui/icons";
import type { SquadPlayer, TopScorer } from "@/lib/types";

export interface TeamScorerGroup {
  competitionId: string;
  competitionName: string;
  rows: TopScorer[];
}

/**
 * A team's goal scorers across all its competitions (live and completed
 * matches; own goals excluded, as in each competition's Golden Boot list),
 * with where each player's goals came from.
 */
export function TeamScorers({ groups, squad, accent }: { groups: TeamScorerGroup[]; squad: SquadPlayer[]; accent: string }) {
  const shirt = new Map(squad.map((p) => [p.name, p.shirtNumber]));
  const byPlayer = new Map<string, { name: string | null; goals: number; parts: { name: string; goals: number }[] }>();
  groups.forEach((g) =>
    g.rows.forEach((r, i) => {
      const key = r.playerName ?? `unnamed-${g.competitionId}-${i}`;
      const p = byPlayer.get(key) ?? { name: r.playerName, goals: 0, parts: [] };
      p.goals += r.goals;
      p.parts.push({ name: g.competitionName, goals: r.goals });
      byPlayer.set(key, p);
    }),
  );
  const players = [...byPlayer.values()].sort((a, b) => b.goals - a.goals || (a.name ?? "~").localeCompare(b.name ?? "~"));
  const total = players.reduce((s, p) => s + p.goals, 0);
  const top = players[0]?.goals ?? 0;
  const single = groups.length === 1 ? groups[0] : null;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle/70 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.02em] uppercase">
          <BallIcon size={14} className="text-brand-fg" />
          {single ? single.competitionName : "All competitions"}
        </p>
        <span className="shrink-0 text-xs font-semibold text-ink-muted tabular-nums">
          {total} {total === 1 ? "goal" : "goals"}
        </span>
      </div>
      <ol aria-label="Goal scorers" className="divide-y divide-line">
        {players.map((p, i) => {
          const no = p.name ? shirt.get(p.name) : undefined;
          return (
            <li key={`${p.name}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className="inline-grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white tabular-nums"
                style={{ background: accent }}
                aria-hidden="true"
              >
                {no ?? <BallIcon size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {p.name ?? "Unnamed player"}
                  {no !== undefined && <span className="sr-only">, shirt {no}</span>}
                </span>
                {!single && (
                  <span className="block truncate text-xs text-ink-muted">
                    {p.parts.map((x) => `${x.name} (${x.goals})`).join(" · ")}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {p.goals === top && top > 0 && (
                  <span className="rounded bg-accent-400 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-900 uppercase">Top</span>
                )}
                <span className="font-display text-[20px] font-extrabold tabular-nums">
                  {p.goals}
                  <span className="sr-only"> {p.goals === 1 ? "goal" : "goals"}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {single && (
        <Link
          href={`/competitions/${single.competitionId}/scorers`}
          className="block border-t border-line px-3 py-2 text-center text-xs font-bold text-brand-fg hover:bg-subtle"
        >
          {single.competitionName} Golden Boot
        </Link>
      )}
    </section>
  );
}
