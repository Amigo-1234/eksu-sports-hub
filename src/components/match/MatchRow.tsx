"use client";

import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { useLiveScore } from "@/components/realtime/LiveScores";
import { FollowedBell } from "@/components/notifications/FollowedBell";
import { BallIcon } from "@/components/ui/icons";
import { eventMinute } from "@/lib/events";
import { formatShortDate } from "@/lib/format";
import { matchAccessibleLabel, matchHref, matchWinner } from "@/lib/match";
import { isDisrupted, isLive, showsScore } from "@/lib/status";
import type { MatchEvent, MatchEventType, MatchSummary, Team } from "@/lib/types";
import { MatchStatusLabel } from "./MatchStatusLabel";

const EVENT_LABEL: Record<MatchEventType, string> = {
  GOAL: "Goal",
  OWN_GOAL: "Own goal",
  PENALTY_GOAL: "Penalty",
  PENALTY_MISS: "Penalty missed",
  YELLOW_CARD: "Yellow card",
  RED_CARD: "Red card",
  SUBSTITUTION: "Substitution",
  SUSPENSION_RETURN: "Return",
  EXCLUSION: "Exclusion",
};

function lastEventText(e: MatchEvent, m: MatchSummary): string {
  const team = e.teamId === m.homeTeamId ? m.homeTeam : m.awayTeam;
  return `${EVENT_LABEL[e.type]} ${eventMinute(e)} · ${team.shortName}`;
}

/**
 * Dense, scannable match row used in every list:
 *
 *   status │ [crest] Home team        2
 *          │ [crest] Away team        1
 *
 * The whole row links to the match centre. Inside a LiveScoresProvider, a
 * live row's score, status, clock and last event update in place.
 */
export function MatchRow({
  match: initial,
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
  const rt = useLiveScore(initial.id);
  const match: MatchSummary = rt
    ? { ...initial, status: rt.status, score: rt.score, clock: rt.clock, periodStartedAt: rt.periodStartedAt, seq: rt.seq }
    : initial;
  const live = isLive(match.status);
  const winner = matchWinner(match);
  const hasScore = showsScore(match.status) && match.score;
  const lastEvent = live ? rt?.lastEvent : null;

  return (
    <Link
      href={matchHref(match.id)}
      aria-label={matchAccessibleLabel(match, serverNow)}
      className="group relative grid min-h-[3.75rem] grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-2 py-2 pr-3 pl-1 transition-colors hover:bg-subtle focus-visible:z-10 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto] sm:pr-4"
    >
      {live && <span className="absolute inset-y-0 left-0 w-[3px] bg-live" aria-hidden="true" />}

      <div className="flex flex-col items-center justify-center text-center text-[12px] leading-tight sm:text-[13px]">
        <MatchStatusLabel match={match} serverNow={serverNow} />
        {showDate && (
          <span className="mt-0.5 text-[11px] font-medium text-ink-faint" aria-hidden="true">
            {formatShortDate(match.kickoffAt).replace(/^\w+ /, "")}
          </span>
        )}
        <FollowedBell matchId={match.id} teamIds={[match.homeTeamId, match.awayTeamId]} status={match.status} className="mt-1" />
      </div>

      <div className="min-w-0">
        {showCompetition && (
          <p className="mb-1 truncate text-[11px] leading-4 font-semibold tracking-wide text-ink-faint uppercase" aria-hidden="true">
            {match.competition.shortName} · {match.round}
          </p>
        )}
        <TeamLine team={match.homeTeam} dim={winner === "away"} strong={winner === "home"} />
        <TeamLine team={match.awayTeam} dim={winner === "home"} strong={winner === "away"} className="mt-1.5" />
        {lastEvent && (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-semibold text-live" aria-live="polite">
            <BallIcon size={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{lastEventText(lastEvent, match)}</span>
          </p>
        )}
        {isDisrupted(match.status) && match.status !== "ABANDONED" && <p className="sr-only">{match.statusNote}</p>}
      </div>

      <div
        className={`flex min-w-[1.5rem] flex-col items-end self-start font-display ${showCompetition ? "pt-[21px]" : "pt-[1px]"} text-[18px] leading-5 font-bold tabular-nums`}
        aria-hidden="true"
      >
        {hasScore ? (
          <>
            <span className={winner === "away" ? "text-ink-faint" : "text-ink"}>{match.score!.home}</span>
            <span className={`mt-1.5 ${winner === "home" ? "text-ink-faint" : "text-ink"}`}>{match.score!.away}</span>
          </>
        ) : null}
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
        className={`truncate text-[14px] leading-5 sm:text-[15px] ${
          strong ? "font-bold text-ink" : dim ? "font-medium text-ink-muted" : "font-semibold text-ink"
        }`}
      >
        <span className="sm:hidden">{team.shortName}</span>
        <span className="hidden sm:inline">{team.name}</span>
      </span>
    </div>
  );
}
