"use client";

import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import { computeScore } from "@/lib/operator/engine";
import { isPrepComplete, seedState, useOperatorSnapshot } from "@/lib/operator/hooks";
import { isLivePhase, PHASE_LABEL } from "@/lib/operator/machine";
import type { AssignmentSeed, OpMatchState } from "@/lib/operator/types";
import { dateKey, formatShortDate, formatTime } from "@/lib/format";

interface Row {
  seed: AssignmentSeed;
  state: OpMatchState;
  prepDone: boolean;
}

function consoleHref(r: Row) {
  return r.state.phase === "SCHEDULED" ? `/op/matches/${r.seed.match.id}` : `/op/matches/${r.seed.match.id}/live`;
}

function PhaseBadge({ state }: { state: OpMatchState }) {
  if (isLivePhase(state.phase)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-live px-2 py-1 text-xs font-extrabold tracking-wide text-white uppercase">
        <span className="size-2 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
        Live · {PHASE_LABEL[state.phase]}
      </span>
    );
  }
  const tone =
    state.phase === "FULL_TIME" ? "border-ink text-ink" :
    state.phase === "SCHEDULED" ? "border-line-strong text-ink-muted" :
    "border-warn text-warn";
  return (
    <span className={`rounded border-2 px-2 py-0.5 text-xs font-extrabold tracking-wide uppercase ${tone}`}>
      {PHASE_LABEL[state.phase]}
    </span>
  );
}

function AssignmentCard({ row }: { row: Row }) {
  const { match, assignment } = row.seed;
  const live = isLivePhase(row.state.phase);
  const score = computeScore(row.state);
  const showScore = row.state.phase !== "SCHEDULED" && row.state.phase !== "POSTPONED" && row.state.phase !== "CANCELLED";

  return (
    <li>
      <Link
        href={consoleHref(row)}
        className={`block rounded-xl border-2 bg-surface p-3 hover:border-ink ${live ? "border-live" : "border-line"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <PhaseBadge state={row.state} />
          <span
            className={`rounded px-2 py-0.5 text-xs font-extrabold tracking-wide uppercase ${
              assignment.role === "PRIMARY" ? "bg-brand-700 text-white" : "bg-subtle text-ink"
            }`}
          >
            {assignment.role === "PRIMARY" ? "Primary" : "Backup"}
          </span>
          {row.state.phase === "SCHEDULED" && (
            <span className={`text-xs font-bold ${row.prepDone ? "text-win" : "text-warn"}`}>
              {row.prepDone ? "✓ Prep complete" : "⚠ Prep not done"}
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {match.competition.shortName} · {match.round}
        </p>
        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
          {(["home", "away"] as const).map((side) => {
            const team = side === "home" ? match.homeTeam : match.awayTeam;
            return (
              <div key={side} className="contents">
                <div className="flex min-w-0 items-center gap-2">
                  <TeamCrest team={team} size="sm" />
                  <span className="truncate text-base font-bold">{team.name}</span>
                </div>
                <span className="font-display text-2xl leading-none font-extrabold tabular-nums">
                  {showScore ? score[side] : ""}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-bold text-ink tabular-nums">{formatTime(match.kickoffAt)}</span> ·{" "}
          {formatShortDate(match.kickoffAt)} · {match.venue.shortName}
        </p>
        {live && (
          <span className="mt-3 flex h-12 items-center justify-center rounded-lg bg-live text-base font-extrabold tracking-wide text-white uppercase">
            Open live console →
          </span>
        )}
      </Link>
    </li>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section aria-labelledby={`sec-${title}`} className="mt-6">
      <h2 id={`sec-${title}`} className="mb-2 flex items-baseline gap-2 font-display text-xl font-extrabold tracking-tight uppercase">
        {title}
        <span className="text-sm font-bold text-ink-muted">{rows.length}</span>
      </h2>
      {rows.length ? (
        <ul className="space-y-3">{rows.map((r) => <AssignmentCard key={r.seed.match.id} row={r} />)}</ul>
      ) : (
        <p className="rounded-xl border-2 border-dashed border-line px-4 py-5 text-center text-sm text-ink-muted">{empty}</p>
      )}
    </section>
  );
}

/** Assigned matches grouped into Today / Upcoming / Completed. */
export function AssignmentList({
  seeds,
  todayKey,
  upcomingLimit,
  completedLimit,
}: {
  seeds: AssignmentSeed[];
  todayKey: string;
  upcomingLimit?: number;
  completedLimit?: number;
}) {
  const snap = useOperatorSnapshot();
  const rows: Row[] = seeds.map((seed) => {
    const prep = snap.prep[seed.match.id] ?? seed.assignment.prep;
    return { seed, state: snap.matches[seed.match.id] ?? seedState(seed), prepDone: isPrepComplete(prep) };
  });

  const byKickoff = (a: Row, b: Row) => a.seed.match.kickoffAt.localeCompare(b.seed.match.kickoffAt);
  const key = (r: Row) => dateKey(r.seed.match.kickoffAt);
  const live = rows.filter((r) => isLivePhase(r.state.phase)).sort(byKickoff);
  const today = rows.filter((r) => !isLivePhase(r.state.phase) && key(r) === todayKey).sort(byKickoff);
  const upcoming = rows.filter((r) => !isLivePhase(r.state.phase) && key(r) > todayKey).sort(byKickoff);
  const completed = rows.filter((r) => !isLivePhase(r.state.phase) && key(r) < todayKey).sort((a, b) => byKickoff(b, a));

  return (
    <>
      {live.length > 0 && (
        <p className="mt-4 rounded-xl bg-live px-4 py-3 text-base font-extrabold text-white" role="status">
          <span aria-hidden="true">● </span>
          {live.length === 1 ? "1 assigned match is LIVE" : `${live.length} assigned matches are LIVE`}
        </p>
      )}
      <Section title="Today" rows={[...live, ...today]} empty="No assignments today." />
      <Section
        title="Upcoming"
        rows={upcomingLimit ? upcoming.slice(0, upcomingLimit) : upcoming}
        empty="No upcoming assignments."
      />
      <Section
        title="Completed"
        rows={completedLimit ? completed.slice(0, completedLimit) : completed}
        empty="Nothing completed yet."
      />
    </>
  );
}
