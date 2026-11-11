import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { BallIcon, CalendarIcon, MapPinIcon } from "@/components/ui/icons";
import { scorersFor } from "@/lib/events";
import { dateKey, formatDayLabel, formatLongDate, formatTime } from "@/lib/format";
import { matchWinner, type Side } from "@/lib/match";
import { isClockRunning, isDisrupted, isLive, showsScore, statusLongLabel } from "@/lib/status";
import type { MatchDetail, Team } from "@/lib/types";
import { LiveMinute } from "./LiveMinute";
import { HalftimeCountdown } from "./RulesClock";

function HeroTeam({ team, dim }: { team: Team; dim: boolean }) {
  return (
    <Link
      href={`/teams/${team.id}`}
      className="group flex min-w-0 flex-col items-center gap-2 rounded-lg p-1 text-center"
    >
      <TeamCrest team={team} size="lg" />
      <span
        className={`line-clamp-2 text-sm leading-tight font-bold group-hover:underline sm:text-base ${
          dim ? "text-ink-muted" : "text-ink"
        }`}
      >
        <span className="sm:hidden">{team.shortName}</span>
        <span className="hidden sm:inline">{team.name}</span>
      </span>
    </Link>
  );
}

function StatusPill({ match, serverNow }: { match: MatchDetail; serverNow: number }) {
  const { status } = match;
  if (isLive(status)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-live/40 bg-live-soft px-2.5 py-1 text-[13px] font-bold tracking-wide text-live uppercase">
        <span className="relative inline-flex size-2" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-live-pulse" />
          <span className="relative size-2 rounded-full bg-live" />
        </span>
        {isClockRunning(status) ? (
          <>
            <span className="sr-only">Live, {statusLongLabel(status)},</span>
            <LiveMinute status={status} periodStartedAt={match.periodStartedAt} clock={match.clock} serverNow={serverNow} />
          </>
        ) : (
          <>
            Half-time
            <HalftimeCountdown status={status} clock={match.clock} prefix=" · " />
          </>
        )}
      </span>
    );
  }
  if (isDisrupted(status)) {
    return (
      <span className="rounded-full border border-warn/40 bg-warn-soft px-2.5 py-1 text-xs font-bold tracking-wide text-warn uppercase">
        {statusLongLabel(status)}
        {status === "ABANDONED" && match.abandonedMinute ? ` · ${match.abandonedMinute}'` : ""}
      </span>
    );
  }
  if (status === "FULL_TIME") {
    return (
      <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-bold tracking-wide text-ink-muted uppercase">
        Full-time
      </span>
    );
  }
  return (
    <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-bold tracking-wide text-ink-muted uppercase">
      {formatDayLabel(dateKey(match.kickoffAt), serverNow)}
    </span>
  );
}

function Scorers({ match, side }: { match: MatchDetail; side: Side }) {
  const lines = scorersFor(match, side);
  if (lines.length === 0) return <div />;
  return (
    <ul className={`min-w-0 space-y-0.5 text-xs text-ink-muted ${side === "home" ? "text-right" : "text-left"}`}>
      {lines.map((l) => (
        <li key={l.label} className="break-words">
          {l.label} <span className="text-ink-faint tabular-nums">{l.minutes.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

/** "FRESHERS CUP SYSTEMS TEST — Not an official result" → badge + subtitle. */
function demoLabel(round: string): { badge: string; note: string } {
  const [badge, ...rest] = round.split(/\s+[—–-]\s+/);
  const note = rest.join(" — ").trim();
  return {
    badge: badge?.trim() || "Demo",
    note: note ? note.charAt(0).toUpperCase() + note.slice(1) : "Not an official result",
  };
}

/** Match centre scoreboard. */
export function MatchHero({ match, serverNow }: { match: MatchDetail; serverNow: number }) {
  const winner = matchWinner(match);
  const scored = showsScore(match.status) && match.score;
  const hasGoals = match.events.some((e) => e.type === "GOAL" || e.type === "PENALTY_GOAL" || e.type === "OWN_GOAL");
  const demo = match.isDemo ? demoLabel(match.round) : null;

  return (
    <section
      aria-label="Scoreboard"
      className="relative -mx-3 overflow-hidden border-y border-line bg-surface sm:mx-0 sm:rounded-card sm:border-x"
    >
      <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-700" aria-hidden="true" />
      {demo ? (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-line px-4 pt-3 pb-2 text-center">
          <Link
            href={`/competitions/${match.competition.id}`}
            className="rounded-full bg-accent-400 px-2.5 py-0.5 text-[11px] font-black tracking-wider text-canvas uppercase hover:underline"
          >
            {demo.badge}
          </Link>
          <span className="text-xs font-semibold text-ink-muted">{demo.note}</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 border-b border-line px-4 pt-3 pb-2 text-center text-[11px] font-bold tracking-[0.08em] text-ink-muted uppercase">
          <Link href={`/competitions/${match.competition.id}`} className="truncate hover:text-ink hover:underline">
            {match.competition.name}
          </Link>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{match.round}</span>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-3 pt-5 pb-4 sm:px-8">
        <HeroTeam team={match.homeTeam} dim={winner === "away"} />

        <div className="flex min-w-[6.5rem] flex-col items-center pt-2">
          {scored ? (
            <p
              className={`flex items-center gap-2.5 font-display text-5xl leading-none font-extrabold tabular-nums sm:text-6xl ${
                match.status === "ABANDONED" ? "text-ink-muted" : ""
              }`}
            >
              <span className="sr-only">Score: {match.homeTeam.name}</span>
              <span>{match.score!.home}</span>
              <span className="text-3xl text-ink-faint" aria-hidden="true">–</span>
              <span className="sr-only">{match.awayTeam.name}</span>
              <span>{match.score!.away}</span>
            </p>
          ) : (
            <p className="font-display text-4xl leading-none font-extrabold tabular-nums sm:text-5xl">
              {isDisrupted(match.status) ? (
                <span className="text-ink-faint">vs</span>
              ) : (
                <time dateTime={match.kickoffAt}>
                  <span className="sr-only">Kick-off </span>
                  {formatTime(match.kickoffAt)}
                </time>
              )}
            </p>
          )}
          <div className="mt-3">
            <StatusPill match={match} serverNow={serverNow} />
          </div>
        </div>

        <HeroTeam team={match.awayTeam} dim={winner === "home"} />
      </div>

      {hasGoals && (
        <div className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-start gap-2 px-4 pb-4 sm:px-8">
          <Scorers match={match} side="home" />
          <BallIcon size={14} className="mx-auto mt-0.5 text-ink-faint" />
          <Scorers match={match} side="away" />
        </div>
      )}

      <dl className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line bg-subtle/60 px-4 py-2.5 text-xs text-ink-muted">
        <div className="flex items-center gap-1.5">
          <dt>
            <CalendarIcon size={14} />
            <span className="sr-only">Kick-off</span>
          </dt>
          <dd>
            {formatLongDate(match.kickoffAt)}, {formatTime(match.kickoffAt)} WAT
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <dt>
            <MapPinIcon size={14} />
            <span className="sr-only">Venue</span>
          </dt>
          <dd className="truncate">{match.venue.name}</dd>
        </div>
      </dl>
    </section>
  );
}
