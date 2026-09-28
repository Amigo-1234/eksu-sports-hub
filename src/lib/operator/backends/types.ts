import type { OperatorBackendKind } from "../backend";
import type { Intent } from "../queue";
import type { OpMatchState, PrepChecks } from "../types";

export type DeliverResult =
  | { ok: true; canonical?: OpMatchState; inControl?: boolean }
  /** retryable: network/transient — the intent goes back to the queue. */
  | { ok: false; retryable: boolean; error: string };

/**
 * What the intent queue talks to. The UI never sees this: it only calls
 * OperatorActions, which queue intents that a backend delivers.
 */
export interface OperatorBackend {
  kind: OperatorBackendKind;
  deliver(intent: Intent): Promise<DeliverResult>;
  /** Authoritative state for a match (null if unavailable). */
  fetchState?(matchId: string): Promise<{ state: OpMatchState; inControl: boolean } | null>;
  savePrep?(matchId: string, prep: PrepChecks): Promise<{ ok: true } | { ok: false; error: string }>;
  takeOver?(matchId: string, intentId: string): Promise<DeliverResult>;
  /** Server clock minus client clock, in ms. */
  measureServerOffset?(): Promise<number | null>;
  signOut?(): Promise<void>;
}
