"use client";

import { useEffect, useState } from "react";
import type { OpCommand } from "@/lib/operator/machine";
import type { OpEvent, OpMatchState } from "@/lib/operator/types";
import { HoldButton } from "./HoldButton";
import { EVENT_LABEL } from "./labels";

export type SheetKind = "goal" | "card" | "sub" | "stoppage" | "pause" | "correct" | "finalise";

/**
 * Operator controls. Every enabled/disabled state comes from `available`
 * (the state machine) — this component never inspects phases itself.
 */
export function ActionPad({
  state,
  available,
  undoable,
  onOpen,
  onUndo,
  onResume,
  onEndHalf,
  onStartSecondHalf,
}: {
  state: OpMatchState;
  available: Set<OpCommand>;
  undoable: OpEvent | null;
  onOpen: (s: SheetKind) => void;
  onUndo: (e: OpEvent) => void;
  onResume: () => void;
  onEndHalf: () => void;
  onStartSecondHalf: () => void;
}) {
  const canRecord = available.has("RECORD_EVENT");
  const [armedUndo, setArmedUndo] = useState<string | null>(null);

  useEffect(() => {
    if (!armedUndo) return;
    const t = setTimeout(() => setArmedUndo(null), 3500);
    return () => clearTimeout(t);
  }, [armedUndo]);

  const undoLabel = undoable
    ? `${EVENT_LABEL[undoable.type]} ${undoable.addedTime ? `${undoable.minute}+${undoable.addedTime}` : undoable.minute}'`
    : null;

  return (
    <div className="mt-3 space-y-3">
      {!canRecord && state.phase === "HALF_TIME" && (
        <p role="status" className="rounded-xl border-2 border-ink bg-accent-100 px-3 py-2.5 text-sm font-bold">
          Half-time. Event recording is locked until the second half starts.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canRecord}
          onClick={() => onOpen("goal")}
          className="col-span-2 h-20 rounded-2xl bg-win text-2xl font-black tracking-wider text-white uppercase disabled:bg-subtle disabled:text-ink-faint"
        >
          ⚽︎ Goal
        </button>
        <button
          type="button"
          disabled={!canRecord}
          onClick={() => onOpen("card")}
          className="h-16 rounded-2xl border-[3px] border-ink bg-accent-400 text-xl font-black tracking-wider text-ink uppercase disabled:border-line disabled:bg-subtle disabled:text-ink-faint"
        >
          ▮ Card
        </button>
        <button
          type="button"
          disabled={!canRecord}
          onClick={() => onOpen("sub")}
          className="h-16 rounded-2xl border-[3px] border-ink bg-surface text-xl font-black tracking-wider text-ink uppercase disabled:border-line disabled:bg-subtle disabled:text-ink-faint"
        >
          ⇅ Sub
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={!undoable || !available.has("VOID_EVENT")}
          onClick={() => {
            if (!undoable) return;
            if (armedUndo === undoable.id) {
              setArmedUndo(null);
              onUndo(undoable);
            } else {
              setArmedUndo(undoable.id);
            }
          }}
          aria-live="polite"
          className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-1 text-center leading-tight disabled:border-line disabled:text-ink-faint ${
            armedUndo && armedUndo === undoable?.id ? "border-live bg-live text-white" : "border-ink bg-surface"
          }`}
        >
          <span className="text-sm font-black uppercase">{armedUndo && armedUndo === undoable?.id ? "Tap again" : "↶ Undo"}</span>
          <span className="mt-0.5 line-clamp-1 text-[11px] font-semibold">{undoLabel ?? "Nothing to undo"}</span>
        </button>
        <button
          type="button"
          disabled={!available.has("SET_STOPPAGE") || !!state.clock.noAddedTime}
          onClick={() => onOpen("stoppage")}
          className="flex min-h-16 flex-col items-center justify-center rounded-xl border-2 border-ink bg-surface leading-tight disabled:border-line disabled:text-ink-faint"
        >
          <span className="text-[13px] font-black whitespace-nowrap uppercase">+ Stoppage</span>
          <span className="text-[11px] font-semibold">
            {state.clock.noAddedTime
              ? "No added time"
              : state.clock.stoppageSeconds ? `+${Math.round(state.clock.stoppageSeconds / 60)} set` : "Announce"}
          </span>
        </button>
        {available.has("RESUME") ? (
          <button
            type="button"
            onClick={onResume}
            className="min-h-16 rounded-xl border-2 border-ink bg-accent-400 text-sm font-black text-ink uppercase"
          >
            ▶︎ Resume
          </button>
        ) : (
          <button
            type="button"
            disabled={!available.has("PAUSE")}
            onClick={() => onOpen("pause")}
            className="min-h-16 rounded-xl border-2 border-ink bg-surface text-sm font-black uppercase disabled:border-line disabled:text-ink-faint"
          >
            ❚❚ Pause
          </button>
        )}
      </div>

      {available.has("VOID_EVENT") && state.events.some((e) => !e.voided) && (
        <button
          type="button"
          onClick={() => onOpen("correct")}
          className="h-12 w-full rounded-xl border-2 border-line-strong text-sm font-bold text-ink-muted hover:border-ink hover:text-ink"
        >
          Correct an earlier event…
        </button>
      )}

      <div className="rounded-2xl border-2 border-dashed border-line-strong p-3">
        <p className="mb-2 text-xs font-extrabold tracking-widest text-ink-muted uppercase">Period control</p>
        {available.has("END_PERIOD") && <HoldButton label="Hold to end 1st half" onConfirm={onEndHalf} tone="brand" />}
        {available.has("START_PERIOD") && <HoldButton label="Hold to start 2nd half" onConfirm={onStartSecondHalf} tone="go" />}
        {available.has("FINALISE_MATCH") && (
          <button
            type="button"
            onClick={() => onOpen("finalise")}
            className="h-16 w-full rounded-xl bg-live text-lg font-extrabold tracking-wide text-white uppercase"
          >
            End match…
          </button>
        )}
      </div>
    </div>
  );
}
