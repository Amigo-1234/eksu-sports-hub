"use client";

import { useContext, useState } from "react";
import { shootoutTally } from "@/lib/operator/score";
import type { KickOutcome, OpKick, OpMatchState, Side } from "@/lib/operator/types";
import type { Team } from "@/lib/types";
import { SquadContext } from "./pickers";

const OUTCOME_LABEL: Record<KickOutcome, string> = { SCORED: "Scored", MISSED: "Missed", SAVED: "Saved" };

/** Kick-by-kick dots for one team (● scored, ○ missed/saved), five slots minimum. */
function KickRow({ kicks, team }: { kicks: OpKick[]; team: Team }) {
  const live = kicks.filter((k) => !k.voided);
  const slots = Math.max(5, live.length);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-sm font-extrabold">{team.code}</span>
      <ol className="flex flex-wrap gap-1.5" aria-label={`${team.shortName} kicks`}>
        {Array.from({ length: slots }, (_, i) => {
          const k = live[i];
          return (
            <li
              key={i}
              className={`grid size-7 place-items-center rounded-full border-2 text-xs font-black ${
                !k ? "border-dashed border-line-strong text-ink-faint" : k.outcome === "SCORED" ? "border-win bg-win text-white" : "border-live bg-surface text-live"
              }`}
              aria-label={k ? `Kick ${i + 1}: ${OUTCOME_LABEL[k.outcome]}${k.shirt ? `, No. ${k.shirt}` : ""}` : `Kick ${i + 1}: not taken`}
            >
              {k ? (k.outcome === "SCORED" ? "✓" : "✕") : i + 1}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Penalty shoot-out console. Kicks are their own records (never goals): the
 * match score does not change. Teams alternate; the panel offers the team to
 * kick next and locks once the shoot-out is decided.
 */
export function ShootoutPanel({
  state,
  home,
  away,
  canRecord,
  canUndo,
  onKick,
  onUndo,
  onFinish,
  canFinish,
}: {
  state: OpMatchState;
  home: Team;
  away: Team;
  canRecord: boolean;
  canUndo: boolean;
  onKick: (side: Side, outcome: KickOutcome, shirt: number | null) => void;
  onUndo: () => void;
  onFinish: () => void;
  canFinish: boolean;
}) {
  const kicks = state.kicks ?? [];
  const tally = shootoutTally(kicks);
  const squads = useContext(SquadContext);
  const [shirt, setShirt] = useState<string>("");
  const next = tally.next;
  const nextTeam = next === "home" ? home : next === "away" ? away : null;
  const roster = next && squads ? squads[next] : [];

  return (
    <section aria-labelledby="pens" className="mt-3 space-y-3 rounded-2xl border-[3px] border-ink p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="pens" className="font-display text-xl font-extrabold tracking-tight uppercase">Penalty shoot-out</h2>
        <p className="font-display text-3xl font-extrabold tabular-nums" aria-label={`Shoot-out ${tally.homeScored} to ${tally.awayScored}`}>
          {tally.homeScored}–{tally.awayScored}
        </p>
      </div>
      <div className="space-y-2">
        <KickRow kicks={kicks.filter((k) => k.side === "home")} team={home} />
        <KickRow kicks={kicks.filter((k) => k.side === "away")} team={away} />
      </div>
      <p className="text-xs font-semibold text-ink-muted">Kicks never count as goals — the match score stays as it was after extra time.</p>

      {tally.decided ? (
        <div role="status" className="rounded-xl bg-win/10 p-3 text-center">
          <p className="font-display text-lg font-extrabold uppercase">
            {(tally.winner === "home" ? home : away).shortName} win {Math.max(tally.homeScored, tally.awayScored)}–{Math.min(tally.homeScored, tally.awayScored)} on penalties
          </p>
          <button
            type="button"
            disabled={!canFinish}
            onClick={onFinish}
            className="mt-3 h-14 w-full rounded-xl bg-live text-lg font-extrabold tracking-wide text-white uppercase disabled:bg-subtle disabled:text-ink-faint"
          >
            End match…
          </button>
        </div>
      ) : (
        nextTeam && (
          <div className="space-y-2">
            <p className="text-sm font-bold">
              Next kick: <span className="font-extrabold">{nextTeam.shortName}</span>
              {tally.homeTaken >= 5 && tally.awayTaken >= 5 && <span className="ml-2 rounded bg-accent-400 px-1.5 text-xs font-extrabold uppercase">Sudden death</span>}
            </p>
            {roster.length > 0 && (
              <label className="block text-sm font-semibold">
                Taker (optional)
                <select
                  value={shirt}
                  onChange={(e) => setShirt(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-lg border-2 border-ink bg-surface px-2 font-bold"
                >
                  <option value="">Not recorded</option>
                  {roster.map((p) => (
                    <option key={p.shirt} value={p.shirt}>
                      No. {p.shirt}
                      {p.name ? ` · ${p.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(["SCORED", "MISSED", "SAVED"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={!canRecord}
                  onClick={() => {
                    onKick(next!, o, shirt ? Number(shirt) : null);
                    setShirt("");
                  }}
                  className={`h-16 rounded-xl text-base font-black uppercase disabled:bg-subtle disabled:text-ink-faint ${
                    o === "SCORED" ? "bg-win text-white" : "border-[3px] border-ink bg-surface text-ink"
                  }`}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>
        )
      )}
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className="h-12 w-full rounded-xl border-2 border-line-strong text-sm font-bold text-ink-muted hover:border-ink hover:text-ink disabled:opacity-50"
      >
        ↶ Undo last kick
      </button>
    </section>
  );
}
