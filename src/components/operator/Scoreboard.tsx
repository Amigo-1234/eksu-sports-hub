"use client";

import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { displayClock } from "@/lib/operator/clock";
import { formatCountdown, halftimeRemaining } from "@/lib/rules/special";
import { computeScore } from "@/lib/operator/engine";
import { isLivePhase, PHASE_LABEL } from "@/lib/operator/machine";
import type { AssignmentSeed, OpMatchState, PauseReason } from "@/lib/operator/types";
import { ConnectionPill } from "./ConnectionPill";
import { PAUSE_LABEL } from "./labels";

/**
 * Always-visible match state: teams, score, period, minute, LIVE, sync.
 * Designed to be read in under a second.
 */
export function Scoreboard({ seed, state, now }: { seed: AssignmentSeed; state: OpMatchState; now: number }) {
  const { homeTeam, awayTeam } = seed.match;
  const score = computeScore(state);
  const running = state.phase === "FIRST_HALF" || state.phase === "SECOND_HALF";
  const clock = running && now ? displayClock(state.clock, now) : null;
  const pauseReason = [...state.log].reverse().find((l) => l.kind === "PAUSED")?.detail as PauseReason | undefined;
  const live = isLivePhase(state.phase);
  // Special rules: no added time → prompt at the regulation end; a timed half-time break.
  const timeUp = !!clock?.timeUp && !!state.clock.noAddedTime;
  const breakLeft = state.phase === "HALF_TIME" && now ? halftimeRemaining(state.rules, state.clock.periodEndedAt, now) : null;

  return (
    <section aria-label="Match state" className="sticky top-0 z-30 -mx-3 border-b-2 border-ink bg-surface px-3 pt-2 pb-2.5">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/op"
          className="inline-flex h-11 min-w-11 shrink-0 items-center gap-1 rounded-lg pr-1 text-sm font-bold whitespace-nowrap text-ink-muted"
          aria-label="Back to my matches"
        >
          <span aria-hidden="true" className="text-lg">←</span>
          <span className="hidden min-[420px]:inline" aria-hidden="true">Matches</span>
        </Link>
        <div className="flex min-w-0 items-center gap-1.5">
          {live && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-live px-2.5 text-xs font-extrabold tracking-wide text-white uppercase">
              <span className="size-2 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
              Live
            </span>
          )}
          <ConnectionPill />
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <TeamSide team={homeTeam} side="Home" />
        <p className="font-display text-5xl leading-none font-extrabold tabular-nums" aria-label={`Score ${score.home} to ${score.away}`}>
          {score.home}
          <span className="px-1 text-3xl text-ink-faint" aria-hidden="true">–</span>
          {score.away}
        </p>
        <TeamSide team={awayTeam} side="Away" align="end" />
      </div>

      <div className="mt-2 flex items-center justify-center gap-2" aria-live="off">
        <span
          className={`rounded px-2 py-1 text-sm font-extrabold tracking-wide uppercase ${
            state.phase === "HALF_TIME" ? "bg-accent-400 text-ink" : live ? "bg-ink text-white" : "border-2 border-ink text-ink"
          }`}
        >
          {state.phase === "HALF_TIME" ? "HT · Half-time" : PHASE_LABEL[state.phase]}
        </span>
        {running && (
          <>
            <span className="font-display text-3xl leading-none font-extrabold tabular-nums" aria-label={clock ? `Match clock ${clock.label}` : undefined}>
              {clock ? clock.mmss : "--:--"}
            </span>
            {clock && (
              <span className="text-sm font-bold text-ink-muted tabular-nums" title="What the public sees">
                {clock.label}
              </span>
            )}
            {clock && clock.announcedMinutes > 0 && (
              <span className="rounded border-2 border-ink px-1.5 text-sm font-extrabold tabular-nums" aria-label={`${clock.announcedMinutes} minutes stoppage announced`}>
                +{clock.announcedMinutes}
              </span>
            )}
          </>
        )}
      </div>

      {timeUp && (
        <p role="status" className="mt-2 rounded-lg bg-live px-3 py-2 text-center text-sm font-extrabold tracking-wide text-white uppercase">
          ⏱ Time — {state.phase === "FIRST_HALF" ? "end the half" : "end the match"} on the referee&apos;s whistle · no added time
        </p>
      )}
      {breakLeft !== null && (
        <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-center text-sm font-extrabold tracking-wide uppercase ${breakLeft > 0 ? "bg-accent-400 text-ink" : "bg-win text-white"}`}>
          {breakLeft > 0
            ? <>Half-time break · <span className="tabular-nums">{formatCountdown(breakLeft)}</span></>
            : "Break over — start the 2nd half when the referee signals"}
        </p>
      )}
      {clock?.paused && (
        <p role="status" className="mt-2 rounded-lg bg-accent-400 px-3 py-2 text-center text-sm font-extrabold tracking-wide text-ink uppercase">
          ❚❚ Clock paused{pauseReason ? ` · ${PAUSE_LABEL[pauseReason]}` : ""}
        </p>
      )}
    </section>
  );
}

function TeamSide({ team, side, align = "start" }: { team: AssignmentSeed["match"]["homeTeam"]; side: string; align?: "start" | "end" }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "end" ? "flex-row-reverse text-right" : ""}`}>
      <TeamCrest team={team} size="md" />
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold tracking-widest text-ink-muted uppercase">{side}</p>
        <p className="text-[15px] leading-tight font-extrabold">
          <span className="min-[360px]:hidden">{team.code}</span>
          <span className="line-clamp-2 max-[359px]:hidden">{team.shortName}</span>
        </p>
      </div>
    </div>
  );
}
