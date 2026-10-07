/**
 * Pure command application: (state, command, now) → new state | rejection.
 *
 * This is the local, optimistic mirror of what the backend RPCs will do.
 * Nothing here touches storage, the network or React.
 */
import type { Score } from "../types.ts";
import {
  displayClock,
  pauseClock,
  resumeClock,
  setStoppage,
  startPeriodClock,
  stopClock,
} from "./clock.ts";
import { canRun, type OpCommand } from "./machine.ts";
import type { OpEvent, OpEventType, OpLogEntry, OpMatchState, PauseReason, Side } from "./types.ts";

export interface NewEvent {
  type: OpEventType;
  side: Side;
  shirt: number | null;
  shirtIn?: number | null;
  /** Client-generated event id (idempotency key). Generated if absent. */
  id?: string;
  /** Minute captured when the operator recorded it (kept for replays). */
  minute?: number;
  addedTime?: number;
}

export type CommandInput =
  | { command: "START_MATCH" }
  | { command: "RECORD_EVENT"; event: NewEvent }
  | { command: "VOID_EVENT"; eventId: string; reason: string }
  | { command: "END_PERIOD" }
  | { command: "START_PERIOD" }
  | { command: "SET_STOPPAGE"; minutes: number }
  | { command: "PAUSE"; reason: PauseReason }
  | { command: "RESUME" }
  | { command: "FINALISE_MATCH"; confirmedScore: Score };

export interface ApplyContext {
  now: number;
  /** Generates stable client IDs (events, log entries). */
  newId: () => string;
  /** Intent that will carry this command, recorded on created events. */
  intentId: string | null;
}

export type ApplyResult =
  | { ok: true; state: OpMatchState; eventId?: string }
  | { ok: false; reason: string };

/** Identical events inside this window are treated as an accidental double tap. */
export const DUPLICATE_WINDOW_MS = 4000;

export const SCORING_TYPES: readonly OpEventType[] = ["GOAL", "PENALTY_GOAL", "OWN_GOAL"];

export const isScoring = (e: Pick<OpEvent, "type">) => SCORING_TYPES.includes(e.type);

export const activeEvents = (s: OpMatchState) => s.events.filter((e) => !e.voided);

const other = (side: Side): Side => (side === "home" ? "away" : "home");

/** Side credited with a scoring event (own goals count for the opponent). */
export function creditedSide(e: Pick<OpEvent, "type" | "side">): Side {
  return e.type === "OWN_GOAL" ? other(e.side) : e.side;
}

/** Score is always recomputed from non-voided scoring events. */
export function computeScore(s: OpMatchState): Score {
  const score: Score = { home: 0, away: 0 };
  for (const e of activeEvents(s)) if (isScoring(e)) score[creditedSide(e)]++;
  return score;
}

export interface PlayerStatus {
  yellow: boolean;
  sentOff: boolean;
  subbedOff: boolean;
  subbedOn: boolean;
}

/** Discipline/substitution status per shirt, from non-voided events. */
export function playerStatuses(s: OpMatchState, side: Side): Map<number, PlayerStatus> {
  const map = new Map<number, PlayerStatus>();
  const get = (n: number) => {
    let p = map.get(n);
    if (!p) {
      p = { yellow: false, sentOff: false, subbedOff: false, subbedOn: false };
      map.set(n, p);
    }
    return p;
  };
  for (const e of activeEvents(s)) {
    if (e.side !== side) continue;
    if (e.type === "YELLOW_CARD" && e.shirt !== null) get(e.shirt).yellow = true;
    if ((e.type === "RED_CARD" || e.type === "SECOND_YELLOW") && e.shirt !== null) get(e.shirt).sentOff = true;
    if (e.type === "SUBSTITUTION") {
      if (e.shirt !== null) get(e.shirt).subbedOff = true;
      if (e.shirtIn != null) get(e.shirtIn).subbedOn = true;
    }
  }
  return map;
}

/** Most recent event the operator can undo with one tap. */
export function lastUndoable(s: OpMatchState): OpEvent | null {
  for (let i = s.events.length - 1; i >= 0; i--) if (!s.events[i].voided) return s.events[i];
  return null;
}

function validateEvent(s: OpMatchState, ev: NewEvent, now: number): string | null {
  const statuses = playerStatuses(s, ev.side);
  const st = (n: number | null | undefined) => (n == null ? undefined : statuses.get(n));
  const needsShirt = ev.type !== "GOAL" && ev.type !== "PENALTY_GOAL" && ev.type !== "OWN_GOAL";

  if (needsShirt && ev.shirt === null) return "Choose a shirt number";
  if (st(ev.shirt)?.sentOff) return `No. ${ev.shirt} has already been sent off`;
  if (st(ev.shirt)?.subbedOff) return `No. ${ev.shirt} has already been substituted off`;

  if (ev.type === "SECOND_YELLOW" && !st(ev.shirt)?.yellow) {
    return `No. ${ev.shirt} has no yellow card yet — record a yellow instead`;
  }
  if (ev.type === "YELLOW_CARD" && st(ev.shirt)?.yellow) {
    return `No. ${ev.shirt} already has a yellow — use Second yellow`;
  }
  if (ev.type === "SUBSTITUTION") {
    if (ev.shirtIn == null) return "Choose the player coming on";
    if (ev.shirtIn === ev.shirt) return "Player on and player off must be different";
    const incoming = st(ev.shirtIn);
    if (incoming?.subbedOff || incoming?.sentOff) return `No. ${ev.shirtIn} can't return to the pitch`;
    if (incoming?.subbedOn) return `No. ${ev.shirtIn} is already on the pitch`;
  }

  const dup = activeEvents(s).find(
    (e) =>
      e.type === ev.type &&
      e.side === ev.side &&
      e.shirt === ev.shirt &&
      (e.shirtIn ?? null) === (ev.shirtIn ?? null) &&
      now - e.recordedAt < DUPLICATE_WINDOW_MS,
  );
  if (dup) return "This looks like a duplicate of the event you just recorded";
  return null;
}

const commandOf = (input: CommandInput): OpCommand => input.command;

export function applyCommand(state: OpMatchState, input: CommandInput, ctx: ApplyContext): ApplyResult {
  const check = canRun(state, commandOf(input));
  if (!check.ok) return check;

  const { now } = ctx;
  const log = (kind: OpLogEntry["kind"], detail?: string): OpLogEntry[] => [
    ...state.log,
    { id: ctx.newId(), at: now, kind, ...(detail ? { detail } : {}) },
  ];
  const next = (patch: Partial<OpMatchState>): OpMatchState => ({
    ...state,
    ...patch,
    version: state.version + 1,
  });

  switch (input.command) {
    case "START_MATCH":
      return { ok: true, state: next({ phase: "FIRST_HALF", clock: startPeriodClock(1, now, state.clock), log: log("MATCH_STARTED") }) };

    case "END_PERIOD":
      return { ok: true, state: next({ phase: "HALF_TIME", clock: stopClock(state.clock, now), log: log("PERIOD_ENDED", "1H") }) };

    case "START_PERIOD":
      return { ok: true, state: next({ phase: "SECOND_HALF", clock: startPeriodClock(2, now, state.clock), log: log("PERIOD_STARTED", "2H") }) };

    case "FINALISE_MATCH": {
      const score = computeScore(state);
      if (score.home !== input.confirmedScore.home || score.away !== input.confirmedScore.away) {
        return { ok: false, reason: "The score changed while you were confirming. Check it again." };
      }
      return {
        ok: true,
        state: next({
          phase: "FULL_TIME",
          clock: stopClock(state.clock, now),
          log: log("MATCH_FINALISED", `${score.home}-${score.away}`),
        }),
      };
    }

    case "PAUSE":
      return { ok: true, state: next({ clock: pauseClock(state.clock, now), log: log("PAUSED", input.reason) }) };

    case "RESUME":
      return { ok: true, state: next({ clock: resumeClock(state.clock, now), log: log("RESUMED") }) };

    case "SET_STOPPAGE": {
      const minutes = Math.max(0, Math.min(30, Math.round(input.minutes)));
      return {
        ok: true,
        state: next({ clock: setStoppage(state.clock, minutes * 60), log: log("STOPPAGE_SET", `+${minutes}`) }),
      };
    }

    case "RECORD_EVENT": {
      // Replaying an event the state already contains is a no-op (idempotent).
      if (input.event.id && state.events.some((e) => e.id === input.event.id)) {
        return { ok: true, state, eventId: input.event.id };
      }
      const problem = validateEvent(state, input.event, now);
      if (problem) return { ok: false, reason: problem };
      const clock = displayClock(state.clock, now);
      const event: OpEvent = {
        id: input.event.id ?? ctx.newId(),
        matchId: state.matchId,
        type: input.event.type,
        side: input.event.side,
        shirt: input.event.shirt,
        ...(input.event.type === "SUBSTITUTION" ? { shirtIn: input.event.shirtIn ?? null } : {}),
        minute: input.event.minute ?? clock.minute,
        addedTime: input.event.addedTime ?? clock.addedTime,
        recordedAt: now,
        voided: null,
        intentId: ctx.intentId,
      };
      return { ok: true, state: next({ events: [...state.events, event] }), eventId: event.id };
    }

    case "VOID_EVENT": {
      const target = state.events.find((e) => e.id === input.eventId);
      if (!target) return { ok: false, reason: "Event not found" };
      if (target.voided) return { ok: false, reason: "This event has already been voided" };
      if (!input.reason.trim()) return { ok: false, reason: "A reason is required" };
      return {
        ok: true,
        state: next({
          events: state.events.map((e) =>
            e.id === target.id ? { ...e, voided: { at: now, reason: input.reason } } : e,
          ),
          log: log("EVENT_VOIDED", `${target.id}: ${input.reason}`),
        }),
      };
    }
  }
}
