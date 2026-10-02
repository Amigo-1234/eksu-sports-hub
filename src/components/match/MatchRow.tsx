import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { formatShortDate } from "@/lib/format";
import { matchAccessibleLabel, matchHref, matchWinner, outcomeNote } from "@/lib/match";
import { isDisrupted, isLive, showsScore } from "@/lib/status";
import type { MatchSummary, Team } from "@/lib/types";
import { MatchStatusLabel } from "./MatchStatusLabel";
import { FollowedBell } from "@/components/notifications/FollowedBell";

/**
 * Dense, scannable match row used in every list. The whole row is one link
 * to the match centre, addressed by match ID.
 */
export function MatchRow({
  match,
  serverNow,
  showCompetition = false,
  showDate = false,
}: {
  match: MatchSummary;
  serverNow: number;
  /** Show the competition label (for lists not already grouped by competition). */
  showCompetition?: boolean;
  /** Show the calendar date under the status (for lists not grouped by date). */
  showDate?: boolean;
}) {
  const live = isLive(match.status);
  const winner = matchWinner(match);
  const hasScore = showsScore(match.status) && match.score;

  return (
    <Link
      href={matchHref(match.id)}
      aria-label={matchAccessibleLabel(match, serverNow)}
      className={`group relative grid min-h-16 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2.5 transition-colors hover:bg-subtle focus-visible:z-10 sm:px-4 ${
        live ? "bg-live-soft/40" : ""
      }`}
    >
      {live && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-live" aria-hidden="true" />}

      <div className="flex flex-col items-center justify-center text-center text-[13px] leading-tight">
        <MatchStatusLabel match={match} serverNow={serverNow} />
        <FollowedBell matchId={match.id} teamIds={[match.homeTeamId, match.awayTeamId]} status={match.status} className="mt-1" />
        {showDate && (
          <span className="mt-0.5 text-[11px] font-medium text-ink-faint" aria-hidden="true">
            {formatShortDate(match.kickoffAt).replace(/^\w+ /, "")}
          </span>
        )}
      </div>

      <div className="min-w-0 border-l border-line pl-3">
        {showCompetition && (
          <p className="mb-1 truncate text-[11px] font-medium tracking-wide text-ink-faint uppercase" aria-hidden="true">
            {match.competition.shortName} · {match.round}
          </p>
        )}
        <TeamLine team={match.homeTeam} dim={winner === "away"} strong={winner === "home"} />
        <TeamLine team={match.awayTeam} dim={winner === "home"} strong={winner === "away"} className="mt-1.5" />
        {outcomeNote(match) && (
          <p className="mt-1 text-[11px] font-semibold text-ink-muted" aria-hidden="true">
            {outcomeNote(match)}
          </p>
        )}
        {isDisrupted(match.status) && match.status !== "ABANDONED" && (
          <p className="sr-only">{match.statusNote}</p>
        )}
      </div>

      <div
        className={`flex min-w-6 flex-col items-end font-display text-lg leading-[1.3rem] font-bold tabular-nums ${
          live ? "text-live" : "text-ink"
        }`}
        aria-hidden="true"
      >
        {hasScore ? (
          <>
            <span className={winner === "away" ? "text-ink-faint" : undefined}>{match.score!.home}</span>
            <span className={`mt-1.5 ${winner === "home" ? "text-ink-faint" : ""}`}>{match.score!.away}</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-ink-faint">–</span>
        )}
      </div>
    </Link>
  );
}

function TeamLine({
  team,
  strong,
  dim,
  className = "",
}: {
  team: Team;
  strong: boolean;
  dim: boolean;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`} aria-hidden="true">
      <TeamCrest team={team} size="xs" />
      <span
        className={`truncate text-[15px] leading-5 ${
          strong ? "font-bold text-ink" : dim ? "font-medium text-ink-muted" : "font-semibold text-ink"
        }`}
      >
        <span className="sm:hidden">{team.shortName}</span>
        <span className="hidden sm:inline">{team.name}</span>
      </span>
    </div>
  );
}
