import Link from "next/link";
import { ChevronRightIcon, TrophyIcon } from "@/components/ui/icons";
import { formatDuration } from "@/lib/operator/clock";
import type { Competition } from "@/lib/types";

export function competitionMeta(c: Competition): string {
  const format =
    c.engineFormat === "GROUPS" ? "Groups" : c.engineFormat === "GROUPS_KNOCKOUT" ? "Groups + knockout" : c.format === "league" ? "League" : "Knockout";
  const category = c.category === "women" ? "Women" : c.category === "men" ? "Men" : "Mixed";
  const length = c.halfSeconds ? ` · 2 × ${formatDuration(c.halfSeconds)}` : "";
  return `${format} · ${category} · ${c.season}${length}`;
}

export function CompetitionBadge({ competition, size = 36 }: { competition: Competition; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg ${
        competition.format === "league" ? "bg-brand-50 text-brand-700" : "bg-accent-100 text-accent-700"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <TrophyIcon size={Math.round(size * 0.52)} />
    </span>
  );
}

export function CompetitionLinkList({ competitions }: { competitions: Competition[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {competitions.map((c) => (
        <li key={c.id}>
          <Link
            href={`/competitions/${c.id}`}
            className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-subtle sm:px-4"
          >
            <CompetitionBadge competition={c} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{c.name}</span>
              <span className="block truncate text-xs text-ink-faint">{competitionMeta(c)}</span>
            </span>
            <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
