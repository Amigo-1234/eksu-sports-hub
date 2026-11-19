import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { Competition } from "@/lib/types";
import { CompetitionBadge } from "./CompetitionLinkList";

/** Home page: every league one tap away, right under the date (Flashscore's league bar). */
export function LeagueStrip({ competitions }: { competitions: Competition[] }) {
  if (competitions.length === 0) return null;
  return (
    <nav aria-label="Leagues" className="-mx-3 mb-4 sm:mx-0">
      <ul className="scrollbar-none flex gap-2 overflow-x-auto px-3 pb-0.5 sm:px-0">
        {competitions.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link
              href={`/competitions/${c.id}`}
              className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3.5 pl-1.5 text-[13px] font-bold shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <CompetitionBadge competition={c} size={30} />
              <span className="max-w-40 truncate">{c.shortName}</span>
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
            href="/competitions"
            className="flex h-11 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-brand-fg hover:bg-brand-50"
          >
            All leagues <ChevronRightIcon size={15} />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
