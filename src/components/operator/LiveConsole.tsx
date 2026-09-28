"use client";

import Link from "next/link";
import { useState } from "react";
import { operatorActions } from "@/lib/operator/actions";
import { computeScore, lastUndoable } from "@/lib/operator/engine";
import { useCanonicalSync, useOperatorSnapshot, useNow, useOpMatch } from "@/lib/operator/hooks";
import { availableCommands, PHASE_LABEL } from "@/lib/operator/machine";
import { operatorStore } from "@/lib/operator/store";
import type { AssignmentSeed, OpEvent, Side } from "@/lib/operator/types";
import { ActionPad, type SheetKind } from "./ActionPad";
import { DemoControls } from "./DemoControls";
import { useFeedback } from "./Feedback";
import { CardFlow } from "./flows/CardFlow";
import { GoalFlow } from "./flows/GoalFlow";
import { CorrectionFlow, FinaliseFlow, PauseFlow, StoppageFlow } from "./flows/SmallFlows";
import { SubFlow } from "./flows/SubFlow";
import { EVENT_LABEL } from "./labels";
import { OpTimeline } from "./OpTimeline";
import { SquadContext } from "./pickers";
import { TakeOverBanner } from "./TakeOverBanner";
import { QueueBanner } from "./QueueBanner";
import { Scoreboard } from "./Scoreboard";
import { Sheet } from "./Sheet";

const TITLES: Record<SheetKind, string> = {
  goal: "Goal",
  card: "Card",
  sub: "Substitution",
  stoppage: "Stoppage time",
  pause: "Pause clock",
  correct: "Correct an event",
  finalise: "End match",
};

export function LiveConsole({ seed }: { seed: AssignmentSeed }) {
  const snap = useOperatorSnapshot();
  const state = useOpMatch(seed);
  const now = useNow();
  const notify = useFeedback();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const matchId = seed.match.id;
  useCanonicalSync(matchId);
  const squads = seed.squads
    ? { home: seed.squads.home.map((p) => p.shirt), away: seed.squads.away.map((p) => p.shirt) }
    : null;
  const inControl = snap.inControl[matchId] !== false;
  const { homeTeam, awayTeam } = seed.match;

  if (!snap.hydrated || !snap.matches[matchId]) {
    return (
      <div role="status" className="py-16 text-center text-sm font-bold text-ink-muted">
        Loading match console…
      </div>
    );
  }

  const available = availableCommands(state);
  const close = () => setSheet(null);
  const scoreLine = () => {
    const s = computeScore(operatorStore.get().matches[matchId] ?? state);
    return `${homeTeam.code} ${s.home}–${s.away} ${awayTeam.code}`;
  };
  const undo = (e: OpEvent, reason = "Undone by operator") => {
    const r = operatorActions.voidEvent(matchId, e.id, reason);
    notify(r.ok ? { tone: "info", message: `Undone: ${EVENT_LABEL[e.type]} ${e.minute}' · ${scoreLine()}` } : { tone: "error", message: r.reason });
  };
  const undoById = (id: string) => {
    const e = operatorStore.get().matches[matchId]?.events.find((x) => x.id === id);
    if (e && !e.voided) undo(e);
  };
  const report = (r: ReturnType<typeof operatorActions.endPeriod>, ok: string) =>
    notify(r.ok ? { tone: "success", message: ok } : { tone: "error", message: r.reason });

  if (state.phase === "SCHEDULED") {
    return (
      <div className="py-12 text-center">
        <p className="font-display text-2xl font-extrabold uppercase">Match not started</p>
        <p className="mt-1 text-sm text-ink-muted">Complete match prep and start the match first.</p>
        <Link href={`/op/matches/${matchId}`} className="mt-5 inline-flex h-12 items-center rounded-xl bg-brand-700 px-6 font-bold text-white">
          Go to match prep
        </Link>
      </div>
    );
  }

  const completed = state.phase === "FULL_TIME" || state.phase === "ABANDONED" || state.phase === "CANCELLED" || state.phase === "POSTPONED";

  return (
    <SquadContext.Provider value={squads}>
      <h1 className="sr-only">
        Live console: {homeTeam.name} versus {awayTeam.name}
      </h1>
      <Scoreboard seed={seed} state={state} now={now} />
      <QueueBanner />
      {!completed && !inControl && <TakeOverBanner matchId={matchId} />}

      {completed ? (
        <section className="mt-4 rounded-2xl border-[3px] border-ink p-4 text-center" aria-live="polite">
          <p className="text-3xl" aria-hidden="true">{state.phase === "FULL_TIME" ? "✓" : "■"}</p>
          <p className="font-display text-3xl font-extrabold uppercase">
            {state.phase === "FULL_TIME" ? "Match completed" : PHASE_LABEL[state.phase]}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Event recording is locked. Any further changes need an administrator.
          </p>
          <Link href="/op" className="mt-4 flex h-14 items-center justify-center rounded-xl bg-brand-700 text-lg font-extrabold text-white uppercase">
            Back to my matches
          </Link>
        </section>
      ) : !inControl ? null : (
        <ActionPad
          state={state}
          available={available}
          undoable={lastUndoable(state)}
          onOpen={setSheet}
          onUndo={(e) => undo(e)}
          onResume={() => report(operatorActions.resumeMatch(matchId), "Clock resumed")}
          onEndHalf={() => report(operatorActions.endPeriod(matchId), "Half-time. Clock stopped.")}
          onStartSecondHalf={() => report(operatorActions.startPeriod(matchId), "2nd half started from 45:00")}
        />
      )}

      <section aria-labelledby="tl" className="mt-6">
        <h2 id="tl" className="mb-2 font-display text-xl font-extrabold tracking-tight uppercase">
          {completed ? "Final timeline" : "Latest events"}
        </h2>
        <OpTimeline seed={seed} state={state} intents={snap.intents} />
      </section>

      <DemoControls matchId={matchId} />

      <Sheet open={sheet !== null} onClose={close} title={sheet ? TITLES[sheet] : ""}>
        {sheet === "goal" && (
          <GoalFlow
            seed={seed}
            state={state}
            onDone={(eventId, side: Side) => {
              close();
              navigator.vibrate?.(30);
              notify({
                tone: "success",
                message: `GOAL ${side === "home" ? homeTeam.shortName : awayTeam.shortName} · ${scoreLine()}`,
                action: { label: "Undo", run: () => undoById(eventId) },
              });
            }}
          />
        )}
        {sheet === "card" && (
          <CardFlow seed={seed} state={state} onDone={(eventId, label) => { close(); notify({ tone: "success", message: label, action: { label: "Undo", run: () => undoById(eventId) } }); }} />
        )}
        {sheet === "sub" && (
          <SubFlow seed={seed} state={state} onDone={(eventId, label) => { close(); notify({ tone: "success", message: label, action: { label: "Undo", run: () => undoById(eventId) } }); }} />
        )}
        {sheet === "stoppage" && (
          <StoppageFlow state={state} onDone={(m) => { close(); notify({ tone: "success", message: m ? `Stoppage +${m} announced` : "Stoppage cleared" }); }} />
        )}
        {sheet === "pause" && (
          <PauseFlow state={state} onDone={() => { close(); notify({ tone: "info", message: "Clock paused" }); }} />
        )}
        {sheet === "correct" && (
          <CorrectionFlow seed={seed} state={state} onDone={(summary) => { close(); notify({ tone: "info", message: `Voided: ${summary} · ${scoreLine()}` }); }} />
        )}
        {sheet === "finalise" && (
          <FinaliseFlow seed={seed} state={state} onDone={() => { close(); notify({ tone: "success", message: `Full-time confirmed · ${scoreLine()}` }); }} />
        )}
      </Sheet>
    </SquadContext.Provider>
  );
}

