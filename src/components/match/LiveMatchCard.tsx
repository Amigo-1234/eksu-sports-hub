import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { matchAccessibleLabel, matchHref } from "@/lib/match";
import { isClockRunning } from "@/lib/status";
import type { MatchSummary, Team } from "@/lib/types";
import { LiveMinute } from "./LiveMinute";
import { LiveDot } from "./MatchStatusLabel";

/** Prominent card for matches in progress (home + live pages). */
export function LiveMatchCard({ match, serverNow }: { match: MatchSummary; serverNow: number }) {
  const score = match.score ?? { home: 0, away: 0 };
  return (
    <Link
      href={matchHref(match.id)}
      aria-label={matchAccessibleLabel(match, serverNow)}
      className="group block overflow-hidden rounded-card border border-line bg-surface transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
        <p className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          {match.competition.shortName} <span aria-hidden="true">·</span> {match.round}
        </p>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-xs font-bold text-white">
          <span className="relative inline-flex size-1.5" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-white motion-safe:animate-live-pulse" />
            <span className="relative size-1.5 rounded-full bg-white" />
          </span>
          {isClockRunning(match.status) ? (
            <LiveMinute status={match.status} periodStartedAt={match.periodStartedAt} serverNow={serverNow} />
          ) : (
            "HT"
          )}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3.5" aria-hidden="true">
        <CardTeam team={match.homeTeam} />
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 font-display text-[2.1rem] leading-none font-extrabold tabular-nums">
            <span>{score.home}</span>
            <span className="text-xl text-ink-faint">–</span>
            <span>{score.away}</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-live uppercase">
            {match.status === "HALF_TIME" ? "Half-time" : <><LiveDot className="scale-75" /> Live</>}
          </p>
        </div>
        <CardTeam team={match.awayTeam} />
      </div>

      <p className="truncate border-t border-line bg-subtle/50 px-3.5 py-1.5 text-center text-[11px] text-ink-faint">
        {match.venue.shortName}
      </p>
    </Link>
  );
}

function CardTeam({ team }: { team: Team }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamCrest team={team} size="md" />
      <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-ink">{team.shortName}</span>
    </div>
  );
}
