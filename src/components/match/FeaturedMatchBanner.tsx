import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { LiveDot } from "@/components/match/MatchStatusLabel";
import { KickoffCountdown } from "@/components/match/KickoffCountdown";
import { formatLongDate, formatTime } from "@/lib/format";
import { matchHref } from "@/lib/match";
import { isLive, showsScore } from "@/lib/status";
import type { MatchSummary } from "@/lib/types";

/** Homepage spotlight for one match (see src/lib/featured-match.ts). */
export function FeaturedMatchBanner({
  match,
  kicker,
  storyId,
  serverNow,
}: {
  match: MatchSummary;
  kicker: string;
  storyId?: string;
  serverNow: number;
}) {
  const live = isLive(match.status);
  const scored = showsScore(match.status) && match.score;
  const upcoming = match.status === "SCHEDULED";

  return (
    <section
      aria-label={`Featured match: ${match.homeTeam.name} versus ${match.awayTeam.name}`}
      className="relative mb-4 overflow-hidden rounded-card bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white shadow-lg"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-400 via-accent-500 to-accent-400" aria-hidden="true" />
      <div className="px-4 pt-4 pb-4 sm:px-6 sm:pt-5">
        <p className="text-center font-display text-[13px] font-extrabold tracking-[0.16em] text-accent-400 uppercase sm:text-sm">
          {kicker}
        </p>
        <p className="mt-0.5 text-center text-[11px] font-semibold tracking-wide text-white/70 uppercase">
          {match.competition.name.replace(/\s*\(.*\)\s*$/, "")}
        </p>

        <Link href={matchHref(match.id)} className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-accent-400">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamCrest team={match.homeTeam} size="lg" />
            <span className="line-clamp-2 font-display text-sm leading-tight font-bold uppercase sm:text-base">{match.homeTeam.name}</span>
          </div>
          <div className="text-center">
            {scored ? (
              <span className="font-display text-4xl font-extrabold tabular-nums">
                {match.score!.home}–{match.score!.away}
              </span>
            ) : (
              <span className="font-display text-3xl font-extrabold">{formatTime(match.kickoffAt)}</span>
            )}
            {live && (
              <span className="mt-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white uppercase">
                <LiveDot /> Live
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamCrest team={match.awayTeam} size="lg" />
            <span className="line-clamp-2 font-display text-sm leading-tight font-bold uppercase sm:text-base">{match.awayTeam.name}</span>
          </div>
        </Link>

        <p className="mt-2 text-center text-xs text-white/75">
          {formatLongDate(match.kickoffAt)} · {formatTime(match.kickoffAt)} WAT
          {match.venue?.name ? ` · ${match.venue.name}` : ""}
        </p>

        {upcoming && (
          <div className="mt-3">
            <KickoffCountdown kickoffAt={match.kickoffAt} serverNow={serverNow} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={matchHref(match.id)}
            className="rounded-full bg-accent-400 px-4 py-2 text-sm font-bold text-brand-900 hover:bg-accent-500"
          >
            {live ? "Follow live" : upcoming ? "Match centre" : "Match report"}
          </Link>
          {storyId && (
            <Link
              href={`/news/${storyId}`}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/20"
            >
              Read the preview
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
