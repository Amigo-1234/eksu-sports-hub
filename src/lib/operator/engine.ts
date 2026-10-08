/**
 * Pure command application: (state, command, now) → new state | rejection.
 *
 * This is the local, optimistic mirror of what the backend RPCs will do.
 * Nothing here touches storage, the network or React.
 */
import type { Score } from "../types.ts";
import {
  activeSeconds,
  displayClock,
  pauseClock,
  resumeClock,
  setStoppage,
  startPeriodClock,
  stopClock,
} from "./clock.ts";
import { canRun, type OpCommand } from "./machine.ts";
import type { OpEvent, OpEventType, OpLogEntry, OpMatchState, PauseReason, Side } from "./types.ts";
import { formatCountdown, hasPlayerRules, suspensionSeconds } from "../rules/special.ts";

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
  /** EXCLUSION: the referee's reason. */
  reason?: string;
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
  /** Out for the rest of the match (normal red card; special rules: excluded). */
  sentOff: boolean;
  /** Normal: substituted off. Special rules: off the pitch now after a substitution. */
  subbedOff: boolean;
  /** Came on at least once. */
  subbedOn: boolean;
  /** Special rules only: the latest movement decides where the player is. */
  lastMove?: "ON" | "OFF" | "RED" | "RETURN" | "EXCLUDED";
  suspended?: boolean;
  /** Active playing time of the suspension's incident (null: unknown → treated as served). */
  suspendedAt?: number | null;
  entries?: number;
  exits?: number;
  redCards?: number;
}

/** Seconds of a temporary suspension still to serve (0 when served or not suspended). */
export function suspensionRemaining(s: OpMatchState, st: PlayerStatus | undefined, now: number): number {
  const secs = suspensionSeconds(s.rules);
  if (!st?.suspended || secs === null || st.suspendedAt == null) return 0;
  return Math.max(0, st.suspendedAt + secs - activeSeconds(s.clock, now));
}

/** Special rules: event-sourced status (rolling substitutions, temporary red cards, exclusion). */
function specialStatuses(s: OpMatchState, side: Side): Map<number, PlayerStatus> {
  const map = new Map<number, PlayerStatus>();
  const temporary = suspensionSeconds(s.rules) !== null;
  const get = (n: number) => {
    let p = map.get(n);
    if (!p) {
      p = { yellow: false, sentOff: false, subbedOff: false, subbedOn: false, suspended: false, suspendedAt: null, entries: 0, exits: 0, redCards: 0 };
      map.set(n, p);
    }
    return p;
  };
  for (const e of activeEvents(s)) {
    if (e.side !== side || e.shirt === null) {
      if (e.side === side && e.type === "SUBSTITUTION" && e.shirtIn != null) {
        const pin = get(e.shirtIn);
        pin.lastMove = "ON";
        pin.entries! += 1;
        pin.subbedOn = true;
      }
      continue;
    }
    const p = get(e.shirt);
    if (p.lastMove === "EXCLUDED") continue;
    switch (e.type) {
      case "YELLOW_CARD":
        p.yellow = true;
        break;
      case "RED_CARD":
      case "SECOND_YELLOW":
        p.redCards! += 1;
        if (temporary) {
          p.lastMove = "RED";
          p.suspended = true;
          p.suspendedAt = e.activeAt ?? null;
        } else {
          p.lastMove = "EXCLUDED";
          p.sentOff = true;
        }
        break;
      case "SUSPENSION_RETURN":
        p.lastMove = "RETURN";
        p.suspended = false;
        break;
      case "EXCLUSION":
        p.lastMove = "EXCLUDED";
        p.sentOff = true;
        p.suspended = false;
        break;
      case "SUBSTITUTION": {
        p.lastMove = "OFF";
        p.exits! += 1;
        if (e.shirtIn != null) {
          const pin = get(e.shirtIn);
          if (pin.lastMove !== "EXCLUDED") {
            pin.lastMove = "ON";
            pin.entries! += 1;
            pin.subbedOn = true;
          }
        }
        break;
      }
    }
  }
  for (const p of map.values()) p.subbedOff = p.lastMove === "OFF";
  return map;
}

/** Discipline/substitution status per shirt, from non-voided events. */
export function playerStatuses(s: OpMatchState, side: Side): Map<number, PlayerStatus> {
  if (hasPlayerRules(s.rules)) return specialStatuses(s, side);
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
  if (hasPlayerRules(s.rules)) {
    const problem = specialProblem(s, ev, st, now);
    if (problem) return problem;
  } else {
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

/** Special rules: mirrors private.sr_check_event (the server stays authoritative). */
function specialProblem(
  s: OpMatchState,
  ev: NewEvent,
  st: (n: number | null | undefined) => PlayerStatus | undefined,
  now: number,
): string | null {
  const p = st(ev.shirt);
  const no = `No. ${ev.shirt}`;
  if (p?.sentOff) return `${no} has been excluded from the match`;
  const suspended = !!p?.suspended;
  const off = p?.lastMove === "OFF" || p?.lastMove === "RED";
  switch (ev.type) {
    case "GOAL":
    case "PENALTY_GOAL":
    case "OWN_GOAL":
    case "PENALTY_MISS":
      if (ev.shirt !== null && suspended) return `${no} is serving a suspension`;
      if (ev.shirt !== null && off) return `${no} is not on the pitch`;
      return null;
    case "YELLOW_CARD":
      return p?.yellow ? `${no} already has a yellow — use Second yellow` : null;
    case "SECOND_YELLOW":
      if (!p?.yellow) return `${no} has no yellow card yet — record a yellow instead`;
      return p?.lastMove === "OFF" ? `${no} is not on the pitch` : null;
    case "RED_CARD":
      return p?.lastMove === "OFF" ? `${no} is not on the pitch — use Exclude for misconduct off the pitch` : null;
    case "SUSPENSION_RETURN": {
      if (!suspended) return `${no} is not serving a suspension`;
      const left = suspensionRemaining(s, p, now);
      return left > 0 ? `${no} still has ${formatCountdown(left)} to serve` : null;
    }
    case "EXCLUSION":
      return (ev.reason ?? "").trim().length < 3 ? "Give the reason for the exclusion" : null;
    case "SUBSTITUTION": {
      if (ev.shirtIn == null) return "Choose the player coming on";
      if (ev.shirtIn === ev.shirt) return "Player on and player off must be different";
      if (suspended) return `${no} is serving a suspension and cannot be replaced`;
      if (off) return `${no} is not on the pitch`;
      const incoming = st(ev.shirtIn);
      if (incoming?.sentOff) return `No. ${ev.shirtIn} has been excluded from the match`;
      if (incoming?.suspended) return `No. ${ev.shirtIn} is serving a suspension`;
      if (incoming?.lastMove === "ON" || incoming?.lastMove === "RETURN") return `No. ${ev.shirtIn} is already on the pitch`;
      if (!s.rules?.rollingSubs && (incoming?.exits ?? 0) > 0) return `No. ${ev.shirtIn} can't return to the pitch`;
      return null;
    }
  }
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
      if (state.clock.noAddedTime && input.minutes > 0) return { ok: false, reason: "There is no added time in this competition" };
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
        ...(state.rules ? { activeAt: Math.floor(activeSeconds(state.clock, now)) } : {}),
        ...(input.event.reason ? { reason: input.event.reason.trim() } : {}),
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
