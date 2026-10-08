"use client";

import { useContext } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { playerStatuses, suspensionRemaining } from "@/lib/operator/engine";
import type { AssignmentSeed, OpMatchState, Side } from "@/lib/operator/types";
import { formatCountdown, suspensionSeconds } from "@/lib/rules/special";
import { useFeedback } from "./Feedback";
import { SquadContext } from "./pickers";

/**
 * Special rules: players serving a temporary red-card suspension. The
 * countdown runs on active playing time only (frozen while the clock is
 * paused or at half-time). Reaching zero makes the player ELIGIBLE — the
 * operator approves the actual return; nothing happens automatically.
 */
export function SuspensionsPanel({ seed, state, now, inControl }: { seed: AssignmentSeed; state: OpMatchState; now: number; inControl: boolean }) {
  const squads = useContext(SquadContext);
  const notify = useFeedback();
  const secs = suspensionSeconds(state.rules);
  if (secs === null) return null;
  const live = state.phase === "FIRST_HALF" || state.phase === "SECOND_HALF";
  const running = live && state.clock.pausedAt === null;
  const rows = (["home", "away"] as Side[]).flatMap((side) =>
    [...playerStatuses(state, side).entries()]
      .filter(([, st]) => st.suspended || st.sentOff)
      .map(([shirt, st]) => ({
        side,
        shirt,
        st,
        name: squads?.[side].find((p) => p.shirt === shirt)?.name ?? null,
        left: suspensionRemaining(state, st, now),
      })),
  );
  if (!rows.length) return null;

  return (
    <section aria-labelledby="susp" className="mt-4 rounded-2xl border-[3px] border-live p-3">
      <h2 id="susp" className="font-display text-lg font-extrabold tracking-tight uppercase">
        Suspensions <span className="text-sm text-ink-muted normal-case">· {secs} s of active play</span>
      </h2>
      {!running && live && <p className="text-xs font-bold text-accent-700">Clock paused — suspension time is not running.</p>}
      {state.phase === "HALF_TIME" && <p className="text-xs font-bold text-accent-700">Half-time does not count — the rest carries into the 2nd half.</p>}
      <ul className="mt-2 divide-y divide-line">
        {rows.map(({ side, shirt, st, name, left }) => {
          const team = side === "home" ? seed.match.homeTeam : seed.match.awayTeam;
          return (
            <li key={`${side}-${shirt}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">
                  No. {shirt}{name ? ` ${name}` : ""} <span className="font-semibold text-ink-muted">· {team.code}</span>
                </p>
                <p className="text-xs font-semibold text-ink-muted">
                  {st.sentOff ? "Excluded for the rest of the match" : left > 0 ? "Serving suspension — team plays a player short" : "Suspension served — eligible to return"}
                </p>
              </div>
              {st.sentOff ? (
                <span className="rounded bg-ink px-2 py-1 text-xs font-black text-white uppercase">Excluded</span>
              ) : left > 0 ? (
                <span
                  className="min-w-16 rounded-lg bg-live px-2 py-1 text-center font-display text-2xl font-extrabold text-white tabular-nums"
                  aria-label={`${Math.ceil(left)} seconds left`}
                >
                  {formatCountdown(left)}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!inControl || !live}
                  onClick={() => {
                    const r = operatorActions.recordEvent(state.matchId, { type: "SUSPENSION_RETURN", side, shirt });
                    notify(r.ok ? { tone: "success", message: `No. ${shirt} back on the pitch` } : { tone: "error", message: r.reason });
                  }}
                  className="h-12 rounded-xl bg-win px-3 text-sm font-extrabold text-white uppercase disabled:opacity-40"
                >
                  ↩ Return to pitch
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
