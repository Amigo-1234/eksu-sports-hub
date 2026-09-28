/**
 * Operator action API. The console only ever calls these functions.
 *
 * Mock implementation: apply the command locally (optimistic), then queue an
 * intent for delivery. A backend implementation keeps the same signatures and
 * swaps the queue's transport for authenticated RPCs (see `COMMANDS[...].rpc`).
 */
import type { Score } from "../types.ts";
import { applyCommand, type CommandInput, type NewEvent } from "./engine.ts";
import { COMMANDS } from "./machine.ts";
import type { Intent } from "./queue.ts";
import { operatorStore } from "./store.ts";
import { now } from "./time.ts";
import { flushQueue } from "./transport.ts";
import type { PauseReason } from "./types.ts";

export type ActionResult = { ok: true; eventId?: string } | { ok: false; reason: string };

export interface OperatorActions {
  startMatch(matchId: string): ActionResult;
  recordEvent(matchId: string, event: NewEvent): ActionResult;
  voidEvent(matchId: string, eventId: string, reason: string): ActionResult;
  endPeriod(matchId: string): ActionResult;
  startPeriod(matchId: string): ActionResult;
  setStoppage(matchId: string, minutes: number): ActionResult;
  pauseMatch(matchId: string, reason: PauseReason): ActionResult;
  resumeMatch(matchId: string): ActionResult;
  finaliseMatch(matchId: string, confirmedScore: Score): ActionResult;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function dispatch(matchId: string, input: CommandInput): ActionResult {
  const state = operatorStore.get().matches[matchId];
  if (!state) return { ok: false, reason: "Match not loaded on this device" };

  const t = now();
  const intentId = newId();
  const result = applyCommand(state, input, { now: t, newId, intentId });
  if (!result.ok) return result;

  const intent: Intent = {
    id: intentId,
    matchId,
    action: COMMANDS[input.command].rpc,
    args: input,
    clientTimestamp: t,
    state: "PENDING",
    attempts: 0,
    lastError: null,
  };
  operatorStore.setMatch(result.state);
  operatorStore.intents.put(intent);
  void flushQueue();
  return { ok: true, eventId: result.eventId };
}

export const mockOperatorActions: OperatorActions = {
  startMatch: (id) => dispatch(id, { command: "START_MATCH" }),
  recordEvent: (id, event) => dispatch(id, { command: "RECORD_EVENT", event }),
  voidEvent: (id, eventId, reason) => dispatch(id, { command: "VOID_EVENT", eventId, reason }),
  endPeriod: (id) => dispatch(id, { command: "END_PERIOD" }),
  startPeriod: (id) => dispatch(id, { command: "START_PERIOD" }),
  setStoppage: (id, minutes) => dispatch(id, { command: "SET_STOPPAGE", minutes }),
  pauseMatch: (id, reason) => dispatch(id, { command: "PAUSE", reason }),
  resumeMatch: (id) => dispatch(id, { command: "RESUME" }),
  finaliseMatch: (id, confirmedScore) => dispatch(id, { command: "FINALISE_MATCH", confirmedScore }),
};

/** The active implementation. Swap for the Supabase-backed one later. */
export const operatorActions: OperatorActions = mockOperatorActions;
