import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { BallIcon, CalendarIcon, MapPinIcon } from "@/components/ui/icons";
import { scorersFor } from "@/lib/events";
import { dateKey, formatDayLabel, formatLongDate, formatTime } from "@/lib/format";
import { matchWinner, outcomeNote, type Side } from "@/lib/match";
import { isClockRunning, isDisrupted, isLive, showsScore, statusLongLabel } from "@/lib/status";
import type { MatchDetail, Team } from "@/lib/types";
import { LiveMinute } from "./LiveMinute";

function HeroTeam({ team, dim }: { team: Team; dim: boolean }) {
  return (
    <Link
      href={`/teams/${team.id}`}
      className="group flex min-w-0 flex-col items-center gap-2 rounded-lg p-1 text-center"
    >
      <TeamCrest team={team} size="lg" />
      <span
        className={`line-clamp-2 text-sm leading-tight font-bold group-hover:underline sm:text-base ${
          dim ? "text-white/70" : "text-white"
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase">
        <span className="relative inline-flex size-1.5" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-white motion-safe:animate-live-pulse" />
          <span className="relative size-1.5 rounded-full bg-white" />
        </span>
        {isClockRunning(status) ? (
          <>
            <span className="sr-only">Live, {statusLongLabel(status)},</span>
            <LiveMinute status={status} periodStartedAt={match.periodStartedAt} clock={match.clock} serverNow={serverNow} />
          </>
        ) : (
          statusLongLabel(status)
        )}
      </span>
    );
  }
  if (isDisrupted(status)) {
    return (
      <span className="rounded-full bg-accent-400 px-2.5 py-1 text-xs font-bold tracking-wide text-brand-900 uppercase">
        {statusLongLabel(status)}
        {status === "ABANDONED" && match.abandonedMinute ? ` · ${match.abandonedMinute}'` : ""}
      </span>
    );
  }
  if (status === "FULL_TIME") {
    return (
      <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase">
        Full-time
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase">
      {formatDayLabel(dateKey(match.kickoffAt), serverNow)}
    </span>
  );
}

function Scorers({ match, side }: { match: MatchDetail; side: Side }) {
  const lines = scorersFor(match, side);
  if (lines.length === 0) return <div />;
  return (
    <ul className={`min-w-0 space-y-0.5 text-xs text-white/80 ${side === "home" ? "text-right" : "text-left"}`}>
      {lines.map((l) => (
        <li key={l.label} className="break-words">
          {l.label} <span className="text-white/60 tabular-nums">{l.minutes.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

/** Penalty shoot-out kicks (● scored, ○ missed/saved) — never part of the score. */
function ShootoutStrip({ match }: { match: MatchDetail }) {
  const s = match.shootout!;
  const row = (team: Team) => {
    const kicks = s.kicks.filter((k) => k.teamId === team.id);
    return (
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-right text-[11px] font-bold text-white/70">{team.code}</span>
        <ol className="flex flex-wrap gap-1" aria-label={`${team.shortName} penalties`}>
          {kicks.map((k, i) => (
            <li
              key={k.id}
              className={`size-3 rounded-full border ${k.outcome === "SCORED" ? "border-accent-300 bg-accent-300" : "border-white/60"}`}
              aria-label={`Kick ${i + 1}: ${k.outcome.toLowerCase()}${k.player.shirtNumber ? `, No. ${k.player.shirtNumber}` : ""}`}
            />
          ))}
        </ol>
      </div>
    );
  };
  return (
    <section aria-label="Penalty shoot-out" className="mx-auto mb-4 w-fit space-y-1 rounded-lg bg-black/15 px-3 py-2">
      <p className="text-center text-[11px] font-bold tracking-wide text-white/70 uppercase">
        Penalties {s.homeScored}–{s.awayScored}
      </p>
      {row(match.homeTeam)}
      {row(match.awayTeam)}
    </section>
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
      className="-mx-3 overflow-hidden bg-brand-800 text-white sm:mx-0 sm:rounded-card"
    >
      {demo ? (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-white/10 px-4 py-2 text-center">
          <Link
            href={`/competitions/${match.competition.id}`}
            className="rounded-full bg-accent-400 px-2.5 py-0.5 text-[11px] font-black tracking-wider text-brand-900 uppercase hover:underline"
          >
            {demo.badge}
          </Link>
          <span className="text-xs font-semibold text-white/80">{demo.note}</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 border-b border-white/10 px-4 py-2 text-center text-[11px] font-semibold tracking-wide text-white/70 uppercase">
          <Link href={`/competitions/${match.competition.id}`} className="truncate hover:text-white hover:underline">
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
                match.status === "ABANDONED" ? "text-white/70" : ""
              }`}
            >
              <span className="sr-only">Score: {match.homeTeam.name}</span>
              <span>{match.score!.home}</span>
              <span className="text-3xl text-white/40" aria-hidden="true">–</span>
              <span className="sr-only">{match.awayTeam.name}</span>
              <span>{match.score!.away}</span>
            </p>
          ) : (
            <p className="font-display text-4xl leading-none font-extrabold tabular-nums sm:text-5xl">
              {isDisrupted(match.status) ? (
                <span className="text-white/60">vs</span>
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
          {outcomeNote(match) && (
            <p className="mt-2 max-w-[11rem] text-center text-xs font-bold text-accent-300">{outcomeNote(match)}</p>
          )}
        </div>

        <HeroTeam team={match.awayTeam} dim={winner === "home"} />
      </div>

      {match.shootout && match.shootout.kicks.length > 0 && <ShootoutStrip match={match} />}

      {hasGoals && (
        <div className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-start gap-2 px-4 pb-4 sm:px-8">
          <Scorers match={match} side="home" />
          <BallIcon size={14} className="mx-auto mt-0.5 text-white/50" />
          <Scorers match={match} side="away" />
        </div>
      )}

      <dl className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/10 bg-black/10 px-4 py-2.5 text-xs text-white/75">
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
