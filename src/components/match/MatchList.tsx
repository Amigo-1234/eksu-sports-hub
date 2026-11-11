import Link from "next/link";
import { CompetitionBadge } from "@/components/competition/CompetitionLinkList";
import { ChevronRightIcon } from "@/components/ui/icons";
import { formatDayLabel, formatShortDate } from "@/lib/format";
import { groupByCompetition, groupByDate, type CompetitionGroup } from "@/lib/grouping";
import { isLive } from "@/lib/status";
import type { MatchSummary } from "@/lib/types";
import { MatchRow } from "./MatchRow";

/** Distinct round labels of a group, in order ("Matchday 1", "Matchday 2"). */
function roundsOf(group: CompetitionGroup): string {
  return [...new Set(group.matches.map((m) => m.round).filter(Boolean))].join(" · ");
}

/**
 * One competition's matches: a slim header bar (badge, name, round, link)
 * over dense rows. Live competitions get a live accent.
 */
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
  const liveCount = group.matches.filter((m) => isLive(m.status)).length;
  const rounds = roundsOf(group);
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <H>
        <Link
          href={`/competitions/${group.competition.id}`}
          className="group flex min-h-11 items-center gap-2.5 border-b border-line bg-subtle/70 px-3 py-1.5 transition-colors hover:bg-subtle sm:px-4"
        >
          <CompetitionBadge competition={group.competition} size={24} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-tight font-bold tracking-[0.02em] text-ink uppercase">
              {group.competition.name}
            </span>
            {rounds && <span className="block truncate text-[11px] leading-tight font-medium text-ink-faint">{rounds}</span>}
          </span>
          {liveCount > 0 && (
            <span className="shrink-0 rounded-sm bg-live px-1.5 py-px text-[10px] max-sm:hidden font-extrabold tracking-wider text-canvas uppercase">
              Live
            </span>
          )}
          <ChevronRightIcon size={16} className="shrink-0 text-ink-faint transition-colors group-hover:text-ink" />
        </Link>
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

/** Matches grouped by competition only (live, today). */
export function MatchesByCompetition({
  matches,
  serverNow,
}: {
  matches: MatchSummary[];
  serverNow: number;
}) {
  return (
    <div className="space-y-2.5">
      {groupByCompetition(matches).map((g) => (
        <CompetitionMatchGroup key={g.competition.id} group={g} serverNow={serverNow} />
      ))}
    </div>
  );
}

/** Slim day divider used above date-grouped lists. */
export function DayHeading({ id, date, serverNow }: { id: string; date: string; serverNow: number }) {
  const label = formatDayLabel(date, serverNow);
  const full = formatShortDate(`${date}T12:00:00Z`);
  return (
    <h2 id={id} className="mb-1.5 flex items-baseline gap-2 px-1 text-xs font-bold tracking-[0.08em] text-ink-muted uppercase">
      <span className="text-ink">{label}</span>
      {label !== full && <span className="font-semibold text-ink-faint">{full}</span>}
    </h2>
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
    <div className="space-y-4">
      {groupByDate(matches).map((day) => (
        <section key={day.date} aria-labelledby={`day-${day.date}`}>
          <DayHeading id={`day-${day.date}`} date={day.date} serverNow={serverNow} />
          <div className="space-y-2.5">
            {day.competitions.map((g) => (
              <CompetitionMatchGroup key={g.competition.id} group={g} serverNow={serverNow} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Flat list with competition + date on each row (team pages, H2H, knockout rounds). */
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
