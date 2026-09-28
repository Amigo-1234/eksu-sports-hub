/**
 * Operator action API. The console only ever calls these functions.
 *
 * Every action: apply locally (optimistic) → queue an intent → the configured
 * backend delivers it (mock: simulated; supabase: authenticated RPC) → the
 * canonical response is reconciled into the store. The UI never sees RPCs.
 */
import type { Score } from "../types.ts";
import { applyCommand, type CommandInput, type NewEvent } from "./engine.ts";
import { COMMANDS } from "./machine.ts";
import type { Intent } from "./queue.ts";
import { operatorStore } from "./store.ts";
import { now } from "./time.ts";
import { getOperatorBackend } from "./backends/index.ts";
import { flushQueue } from "./transport.ts";
import type { PauseReason, PrepChecks } from "./types.ts";

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
  // UX guard only — the database enforces control on every RPC.
  if (state.phase !== "SCHEDULED" && operatorStore.get().inControl[matchId] === false) {
    return { ok: false, reason: "Another operator is in control. Take over to continue." };
  }

  const t = now();
  // For events the client-generated event id IS the intent id (idempotency key).
  const intentId = input.command === "RECORD_EVENT" ? (input.event.id ?? newId()) : newId();
  const withId: CommandInput =
    input.command === "RECORD_EVENT" ? { ...input, event: { ...input.event, id: intentId } } : input;
  const result = applyCommand(state, withId, { now: t, newId, intentId });
  if (!result.ok) return result;

  // Freeze the minute the operator saw, so retries and replays are identical.
  let args: CommandInput = withId;
  if (withId.command === "RECORD_EVENT") {
    const created = result.state.events.find((e) => e.id === intentId);
    args = { ...withId, event: { ...withId.event, minute: created?.minute, addedTime: created?.addedTime } };
  }

  const intent: Intent = {
    id: intentId,
    matchId,
    action: COMMANDS[input.command].rpc,
    args,
    clientTimestamp: t,
    state: "PENDING",
    attempts: 0,
    lastError: null,
    queuedOffline: !operatorStore.isOnline(),
  };
  operatorStore.setMatch(result.state);
  operatorStore.intents.put(intent);
  void flushQueue();
  return { ok: true, eventId: result.eventId };
}

const queuedOperatorActions: OperatorActions = {
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

/**
 * The UI-facing actions. Identical for both backends: what differs is how
 * queued intents are delivered (backends/mock.ts or backends/supabase.ts).
 */
export const operatorActions: OperatorActions = queuedOperatorActions;

/** Actions that need the server directly (not optimistic, not queued). */
export const operatorControl = {
  /** Take control of a match from another operator (supabase backend). */
  async takeOver(matchId: string): Promise<ActionResult> {
    const backend = getOperatorBackend();
    if (!backend.takeOver) return { ok: true };
    if (!operatorStore.isOnline()) return { ok: false, reason: "Taking over needs a connection" };
    const r = await backend.takeOver(matchId, newId());
    if (!r.ok) return { ok: false, reason: r.error };
    if (r.canonical) operatorStore.reconcile(matchId, r.canonical, true);
    return { ok: true };
  },

  /** Pull the authoritative state (refresh / other-device sync). */
  async refresh(matchId: string): Promise<void> {
    const backend = getOperatorBackend();
    if (!backend.fetchState || !operatorStore.isOnline()) return;
    const r = await backend.fetchState(matchId);
    if (r) operatorStore.reconcile(matchId, r.state, r.inControl);
  },

  async savePrep(matchId: string, prep: PrepChecks): Promise<ActionResult> {
    operatorStore.setPrep(matchId, prep);
    const backend = getOperatorBackend();
    if (!backend.savePrep) return { ok: true };
    const r = await backend.savePrep(matchId, prep);
    return r.ok ? { ok: true } : { ok: false, reason: r.error };
  },

  async signOut(): Promise<void> {
    await getOperatorBackend().signOut?.();
  },
};
