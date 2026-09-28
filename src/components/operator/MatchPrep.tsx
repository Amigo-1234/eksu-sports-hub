"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeamCrest } from "@/components/team/TeamCrest";
import { formatLongDate, formatTime } from "@/lib/format";
import { operatorActions } from "@/lib/operator/actions";
import { isPrepComplete, useConnection, useNow, useOpMatch, usePrep } from "@/lib/operator/hooks";
import { canRun, PHASE_LABEL } from "@/lib/operator/machine";
import { operatorStore } from "@/lib/operator/store";
import type { AssignmentSeed, PrepChecks } from "@/lib/operator/types";
import { ConnectionPill } from "./ConnectionPill";
import { DemoControls } from "./DemoControls";
import { useFeedback } from "./Feedback";
import { HoldButton } from "./HoldButton";

const CHECKS: { key: keyof PrepChecks; label: string }[] = [
  { key: "atVenue", label: "I am at the venue" },
  { key: "teamsPresent", label: "Both teams are present" },
  { key: "officialsReady", label: "Referee and officials are ready" },
];

function countdown(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  const text = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

export function MatchPrep({ seed }: { seed: AssignmentSeed }) {
  const router = useRouter();
  const notify = useFeedback();
  const state = useOpMatch(seed);
  const prep = usePrep(seed);
  const now = useNow();
  const { online, status, snap } = useConnection();
  const { match, assignment } = seed;
  const ready = isPrepComplete(prep);
  const canStart = canRun(state, "START_MATCH");
  const untilKickoff = now ? Date.parse(match.kickoffAt) - now : null;
  const queued = snap.intents.filter((i) => i.matchId === match.id && i.state !== "CONFIRMED").length;

  const toggle = (key: keyof PrepChecks) => operatorStore.setPrep(match.id, { ...prep, [key]: !prep[key] });

  return (
    <div className="pt-3">
      <Link href="/op" className="inline-flex h-11 items-center text-sm font-bold text-ink-muted">← My matches</Link>
      <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight uppercase">Match prep</h1>

      <section aria-label="Match details" className="mt-3 rounded-2xl border-2 border-ink bg-surface p-4">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          {match.competition.name} · {match.round}
        </p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center">
          <div className="flex min-w-0 flex-col items-center gap-1">
            <TeamCrest team={match.homeTeam} size="lg" />
            <span className="text-[10px] font-extrabold tracking-widest text-ink-muted uppercase">Home</span>
            <span className="line-clamp-2 font-bold">{match.homeTeam.name}</span>
          </div>
          <span className="font-display text-2xl font-extrabold text-ink-faint">v</span>
          <div className="flex min-w-0 flex-col items-center gap-1">
            <TeamCrest team={match.awayTeam} size="lg" />
            <span className="text-[10px] font-extrabold tracking-widest text-ink-muted uppercase">Away</span>
            <span className="line-clamp-2 font-bold">{match.awayTeam.name}</span>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-line text-sm">
          {[
            ["Kick-off", `${formatTime(match.kickoffAt)} WAT · ${formatLongDate(match.kickoffAt)}${untilKickoff !== null ? ` (${countdown(untilKickoff)})` : ""}`],
            ["Venue", match.venue.name],
            ["Your role", assignment.role === "PRIMARY" ? "Primary operator" : "Backup operator"],
            ["Status", PHASE_LABEL[state.phase]],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="shrink-0 text-ink-muted">{k}</dt>
              <dd className="text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="conn" className="mt-4 rounded-2xl border-2 border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="conn" className="font-bold">Connection</h2>
          <ConnectionPill />
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          <li>{online ? "✓ Online" : "⨯ Offline"} — {online ? "actions will sync as you record them." : "you can still start and record; actions queue on this device."}</li>
          <li>✓ Offline queue ready · {queued} waiting{status.kind === "NEEDS_ATTENTION" ? " · some failed" : ""}</li>
          <li className="text-ink-muted">Demo: the queue lives in this browser only.</li>
        </ul>
      </section>

      {state.phase === "SCHEDULED" ? (
        <>
          <fieldset className="mt-4 rounded-2xl border-2 border-line bg-surface p-4">
            <legend className="px-1 font-bold">Checklist</legend>
            <div className="grid gap-2">
              {CHECKS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={prep[c.key]}
                  onClick={() => toggle(c.key)}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 text-left font-bold ${
                    prep[c.key] ? "border-win bg-win/10" : "border-line-strong bg-surface"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-7 shrink-0 place-items-center rounded-md border-2 text-sm font-black ${prep[c.key] ? "border-win bg-win text-white" : "border-line-strong"}`}
                  >
                    {prep[c.key] ? "✓" : ""}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div
            role="status"
            className={`mt-4 rounded-2xl px-4 py-4 text-center ${ready ? "bg-win text-white" : "border-2 border-dashed border-line-strong text-ink-muted"}`}
          >
            <p className="font-display text-2xl font-extrabold tracking-wide uppercase">
              {ready ? "✓ Ready for match" : "Not ready"}
            </p>
            {!ready && <p className="text-sm font-semibold">Complete the checklist to enable Start.</p>}
          </div>

          {assignment.role === "BACKUP" && (
            <p className="mt-3 rounded-xl bg-accent-100 px-3 py-2 text-sm font-semibold">
              You are the <strong>backup</strong> operator. Only start if the primary operator is not available.
            </p>
          )}
          {untilKickoff !== null && untilKickoff > 30 * 60_000 && (
            <p className="mt-3 rounded-xl bg-accent-100 px-3 py-2 text-sm font-semibold">
              ⚠ Scheduled kick-off is {countdown(untilKickoff)}. Only start when the referee kicks off.
            </p>
          )}

          <div className="mt-4">
            <HoldButton
              tone="go"
              label="Hold to start match"
              durationMs={2000}
              disabled={!ready || !canStart.ok || !snap.hydrated}
              hint={ready ? "Press and hold for 2 seconds at kick-off" : "Complete the checklist first"}
              onConfirm={() => {
                const r = operatorActions.startMatch(match.id);
                if (r.ok) {
                  notify({ tone: "success", message: "Match started · 1st half" });
                  router.push(`/op/matches/${match.id}/live`);
                } else notify({ tone: "error", message: r.reason });
              }}
            />
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border-2 border-ink p-4 text-center">
          <p className="font-bold">
            {state.phase === "POSTPONED" || state.phase === "CANCELLED"
              ? `This match is ${PHASE_LABEL[state.phase].toLowerCase()}. It can't be started from the console.`
              : "This match has already started."}
          </p>
          {state.phase !== "POSTPONED" && state.phase !== "CANCELLED" && (
            <Link href={`/op/matches/${match.id}/live`} className="mt-3 flex h-14 items-center justify-center rounded-xl bg-live text-lg font-extrabold text-white uppercase">
              Open live console
            </Link>
          )}
          {seed.match.statusNote && <p className="mt-2 text-sm text-ink-muted">{seed.match.statusNote}</p>}
        </div>
      )}

      <DemoControls matchId={match.id} />
    </div>
  );
}
