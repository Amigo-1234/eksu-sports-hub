/**
 * Intent queue — every operator command becomes an intent that must reach
 * the server. The UI applies the command optimistically and shows the
 * intent's state; the transport moves intents PENDING → SENDING → CONFIRMED
 * (or FAILED).
 *
 * `IntentStore` is the persistence seam. The demo uses an in-memory store
 * mirrored to localStorage; production swaps in IndexedDB with the same API.
 */
import type { CommandInput } from "./engine.ts";

export type IntentState = "PENDING" | "SENDING" | "CONFIRMED" | "FAILED";

export interface Intent {
  id: string;
  matchId: string;
  /** Backend RPC name, e.g. "record_event". */
  action: string;
  args: CommandInput;
  /** Client time the operator acted — the server reconciles against this. */
  clientTimestamp: number;
  state: IntentState;
  attempts: number;
  lastError: string | null;
}

export interface IntentStore {
  all(): Intent[];
  put(intent: Intent): void;
  update(id: string, patch: Partial<Intent>): Intent | null;
  /** Drop confirmed intents older than `before` (housekeeping). */
  prune(before: number): void;
  clearMatch(matchId: string): void;
}

export function createMemoryIntentStore(initial: Intent[] = []): IntentStore {
  let items = [...initial];
  return {
    all: () => items,
    put(intent) {
      items = [...items, intent];
    },
    update(id, patch) {
      let updated: Intent | null = null;
      items = items.map((i) => {
        if (i.id !== id) return i;
        updated = { ...i, ...patch };
        return updated;
      });
      return updated;
    },
    prune(before) {
      items = items.filter((i) => !(i.state === "CONFIRMED" && i.clientTimestamp < before));
    },
    clearMatch(matchId) {
      items = items.filter((i) => i.matchId !== matchId);
    },
  };
}

/** Intents still owed to the server. */
export const isOutstanding = (i: Intent) => i.state !== "CONFIRMED";

export type ConnectionStatus =
  | { kind: "CONNECTED" }
  | { kind: "SYNCING"; count: number }
  | { kind: "OFFLINE"; queued: number }
  | { kind: "NEEDS_ATTENTION"; failed: number };

/** Header connection state, derived from reachability + the queue. */
export function connectionStatus(online: boolean, intents: Intent[]): ConnectionStatus {
  const failed = intents.filter((i) => i.state === "FAILED").length;
  const outstanding = intents.filter((i) => i.state === "PENDING" || i.state === "SENDING").length;
  if (failed > 0) return { kind: "NEEDS_ATTENTION", failed };
  if (!online) return { kind: "OFFLINE", queued: outstanding };
  if (outstanding > 0) return { kind: "SYNCING", count: outstanding };
  return { kind: "CONNECTED" };
}
