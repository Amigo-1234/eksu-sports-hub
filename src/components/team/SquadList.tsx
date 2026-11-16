import type { SquadPlayer } from "@/lib/types";

const GROUPS: { key: string; label: string }[] = [
  { key: "GK", label: "Goalkeepers" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
  { key: "", label: "Squad" },
];

/** Public squad list grouped by position. Names, shirt numbers and positions only. */
export function SquadList({ players, accent }: { players: SquadPlayer[]; accent: string }) {
  const groups = GROUPS.map((g) => ({ ...g, players: players.filter((p) => (p.position ?? "") === g.key || (!g.key && !["GK", "DF", "MF", "FW"].includes(p.position ?? ""))) })).filter(
    (g) => g.players.length > 0,
  );
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {groups.map((g) => (
        <div key={g.label} className="border-b border-line last:border-b-0">
          <h3 className="bg-subtle px-4 py-1.5 text-[11px] font-bold tracking-wide text-ink-muted uppercase">{g.label}</h3>
          <ul className="divide-y divide-line">
            {g.players.map((p) => (
              <li key={`${p.shirtNumber}-${p.name}`} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full font-display text-sm font-bold text-white tabular-nums"
                  style={{ background: accent }}
                  aria-label={`Shirt number ${p.shirtNumber}`}
                >
                  {p.shirtNumber}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                {p.captain && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700" title="Captain">
                    C
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
