import Link from "next/link";
import { formatDayLabel, formatShortDate } from "@/lib/format";
import { groupByCompetition, groupByDate, type CompetitionGroup } from "@/lib/grouping";
import type { MatchSummary } from "@/lib/types";
import { MatchRow } from "./MatchRow";

/** Card containing one competition's matches under a quiet header. */
export function CompetitionMatchGroup({
  group,
  serverNow,
  headingLevel = 3,
}: {
  group: CompetitionGroup;
  serverNow: number;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <H className="flex items-center justify-between gap-2 border-b border-line bg-subtle/60 px-3 py-2 sm:px-4">
        <Link
          href={`/competitions/${group.competition.id}`}
          className="min-w-0 truncate text-xs font-bold tracking-wide text-ink-muted uppercase hover:text-brand-700"
        >
          {group.competition.name}
        </Link>
        <span className="shrink-0 text-[11px] font-medium text-ink-faint">{group.matches[0]?.round}</span>
      </H>
      <ul className="divide-y divide-line">
        {group.matches.map((m) => (
          <li key={m.id}>
            <MatchRow match={m} serverNow={serverNow} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Matches grouped by competition only (e.g. "Today" on the home page). */
export function MatchesByCompetition({
  matches,
  serverNow,
}: {
  matches: MatchSummary[];
  serverNow: number;
}) {
  return (
    <div className="space-y-3">
      {groupByCompetition(matches).map((g) => (
        <CompetitionMatchGroup key={g.competition.id} group={g} serverNow={serverNow} />
      ))}
    </div>
  );
}

/** Matches grouped by date, then competition (fixtures, results). */
export function MatchesByDate({
  matches,
  serverNow,
}: {
  matches: MatchSummary[];
  serverNow: number;
}) {
  return (
    <div className="space-y-6">
      {groupByDate(matches).map((day) => {
        const label = formatDayLabel(day.date, serverNow);
        const full = formatShortDate(`${day.date}T12:00:00Z`);
        return (
          <section key={day.date} aria-labelledby={`day-${day.date}`}>
            <h2
              id={`day-${day.date}`}
              className="mb-2 flex items-baseline gap-2 px-1 font-display text-lg font-bold tracking-tight"
            >
              {label}
              {label !== full && <span className="text-sm font-medium text-ink-faint">{full}</span>}
            </h2>
            <div className="space-y-3">
              {day.competitions.map((g) => (
                <CompetitionMatchGroup key={g.competition.id} group={g} serverNow={serverNow} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Flat card list with competition + date on each row (team pages, H2H). */
export function MatchCardList({
  matches,
  serverNow,
  showCompetition = true,
}: {
  matches: MatchSummary[];
  serverNow: number;
  showCompetition?: boolean;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {matches.map((m) => (
        <li key={m.id}>
          <MatchRow match={m} serverNow={serverNow} showCompetition={showCompetition} showDate />
        </li>
      ))}
    </ul>
  );
}
