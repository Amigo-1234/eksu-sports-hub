/**
 * Delivers queued intents through the configured backend, strictly in order.
 *
 * - success   → CONFIRMED; canonical state (if returned) is reconciled
 * - transient → back to PENDING; retried automatically (every RPC is
 *               idempotent on its intent/event id, so retries are safe)
 * - rejected  → FAILED; the queue stops until the operator retries or discards
 */
import { getOperatorBackend } from "./backends/index.ts";
import { operatorStore } from "./store.ts";

const RETRY_MS = 4000;
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue();
  }, RETRY_MS);
}

export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  const backend = getOperatorBackend();
  try {
    while (operatorStore.isOnline()) {
      const intents = operatorStore.get().intents;
      if (intents.some((i) => i.state === "FAILED")) break;
      const next = intents.find((i) => i.state === "PENDING");
      if (!next) break;
      operatorStore.intents.update(next.id, { state: "SENDING", attempts: next.attempts + 1 });
      const result = await backend.deliver({ ...next, attempts: next.attempts + 1 });
      if (result.ok) {
        operatorStore.intents.update(next.id, { state: "CONFIRMED", lastError: null });
        if (result.canonical) operatorStore.reconcile(next.matchId, result.canonical, result.inControl);
      } else if (result.retryable || !operatorStore.isOnline()) {
        operatorStore.intents.update(next.id, { state: "PENDING", lastError: result.error });
        scheduleRetry();
        break;
      } else {
        operatorStore.intents.update(next.id, { state: "FAILED", lastError: result.error });
      }
    }
  } finally {
    flushing = false;
  }
}

/** Put failed intents back in the queue and try again. */
export function retryFailed() {
  for (const i of operatorStore.get().intents) {
    if (i.state === "FAILED") operatorStore.intents.update(i.id, { state: "PENDING" });
  }
  void flushQueue();
}

/** Drop rejected intents (the server said no); local state rolls back. */
export function discardFailed() {
  for (const i of operatorStore.get().intents) {
    if (i.state === "FAILED") operatorStore.intents.discard(i.id);
  }
  void flushQueue();
}

/** Keep flushing whenever connectivity returns. */
export function startTransport() {
  let wasOnline = operatorStore.isOnline();
  const unsubscribe = operatorStore.subscribe(() => {
    const online = operatorStore.isOnline();
    if (online && !wasOnline) void flushQueue();
    wasOnline = online;
  });
  void flushQueue();
  return unsubscribe;
}
