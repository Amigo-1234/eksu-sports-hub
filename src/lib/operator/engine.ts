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
import { canRun, endPeriodTarget, startPeriodTarget, type OpCommand } from "./machine.ts";
import { activeEvents, computeScore, shootoutTally } from "./score.ts";
import type { KickOutcome, OpEvent, OpEventType, OpKick, OpLogEntry, OpMatchState, PauseReason, Side } from "./types.ts";

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
  | { command: "FINALISE_MATCH"; confirmedScore: Score }
  | { command: "RECORD_KICK"; kick: NewKick }
  | { command: "VOID_KICK"; kickId: string; reason: string };

export interface NewKick {
  side: Side;
  shirt: number | null;
  outcome: KickOutcome;
  /** Client-generated kick id (idempotency key). Generated if absent. */
  id?: string;
}

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

export { activeEvents, computeScore, creditedSide, isScoring, SCORING_TYPES } from "./score.ts";

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

    case "END_PERIOD": {
      const to = endPeriodTarget(state);
      if (!to) return { ok: false, reason: "End the match instead" };
      const label = { FIRST_HALF: "1H", SECOND_HALF: "2H", EXTRA_TIME_FIRST: "ET1", EXTRA_TIME_SECOND: "ET2" }[state.phase as "FIRST_HALF"] ?? state.phase;
      const stopped = stopClock(state.clock, now);
      if (to === "PENALTIES") {
        // The shoot-out has no running clock (period 5, frozen).
        return {
          ok: true,
          state: next({
            phase: "PENALTIES",
            clock: { ...startPeriodClock(5, now, state.clock), clockRunning: false, periodEndedAt: now },
            log: [...log("PERIOD_ENDED", label), { id: ctx.newId(), at: now, kind: "SHOOTOUT_STARTED" }],
            kicks: state.kicks ?? [],
          }),
        };
      }
      return { ok: true, state: next({ phase: to, clock: stopped, log: log("PERIOD_ENDED", label) }) };
    }

    case "START_PERIOD": {
      const to = startPeriodTarget(state);
      if (!to) return { ok: false, reason: "No period to start" };
      const period = to === "SECOND_HALF" ? 2 : to === "EXTRA_TIME_FIRST" ? 3 : 4;
      const label = to === "SECOND_HALF" ? "2H" : to === "EXTRA_TIME_FIRST" ? "ET1" : "ET2";
      return { ok: true, state: next({ phase: to, clock: startPeriodClock(period, now, state.clock), log: log("PERIOD_STARTED", label) }) };
    }

    case "RECORD_KICK": {
      const kicks = state.kicks ?? [];
      if (input.kick.id && kicks.some((k) => k.id === input.kick.id)) return { ok: true, state, eventId: input.kick.id };
      const tally = shootoutTally(kicks);
      const mine = input.kick.side === "home" ? tally.homeTaken : tally.awayTaken;
      const theirs = input.kick.side === "home" ? tally.awayTaken : tally.homeTaken;
      if (mine > theirs) return { ok: false, reason: "It is the other team's kick" };
      const kick: OpKick = {
        id: input.kick.id ?? ctx.newId(),
        side: input.kick.side,
        shirt: input.kick.shirt,
        outcome: input.kick.outcome,
        voided: null,
        intentId: ctx.intentId,
      };
      return { ok: true, state: next({ kicks: [...kicks, kick], log: log("SHOOTOUT_KICK", `${kick.side}:${kick.outcome}`) }), eventId: kick.id };
    }

    case "VOID_KICK": {
      const kicks = state.kicks ?? [];
      const target = kicks.find((k) => k.id === input.kickId);
      if (!target) return { ok: false, reason: "Kick not found" };
      if (target.voided) return { ok: false, reason: "This kick has already been voided" };
      if (!input.reason.trim()) return { ok: false, reason: "A reason is required" };
      return {
        ok: true,
        state: next({
          kicks: kicks.map((k) => (k.id === target.id ? { ...k, voided: { at: now, reason: input.reason } } : k)),
          log: log("SHOOTOUT_KICK_VOIDED", input.reason),
        }),
      };
    }

    case "FINALISE_MATCH": {
      const score = computeScore(state);
      if (score.home !== input.confirmedScore.home || score.away !== input.confirmedScore.away) {
        return { ok: false, reason: "The score changed while you were confirming. Check it again." };
      }
      const pens = state.phase === "PENALTIES" ? shootoutTally(state.kicks) : null;
      return {
        ok: true,
        state: next({
          phase: "FULL_TIME",
          clock: state.phase === "PENALTIES" ? state.clock : stopClock(state.clock, now),
          log: log("MATCH_FINALISED", `${score.home}-${score.away}${pens ? ` (${pens.homeScored}-${pens.awayScored} pens)` : ""}`),
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
