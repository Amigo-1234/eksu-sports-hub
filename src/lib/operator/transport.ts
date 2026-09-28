/**
 * MOCK transport. Simulates delivering intents to the server so the UI can
 * show PENDING → SENDING → CONFIRMED / FAILED. Nothing leaves the browser.
 *
 * Production replaces `deliver()` with the authenticated Supabase RPC call
 * named by `intent.action`. Intents are sent strictly in order; a failure
 * stops the queue until the operator retries, so the server never sees
 * commands out of sequence.
 */
import { operatorStore } from "./store.ts";

const SIMULATED_LATENCY_MS = 700;

let flushing = false;

async function deliver(): Promise<{ ok: true } | { ok: false; error: string }> {
  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
  if (!operatorStore.isOnline()) return { ok: false, error: "Connection lost while sending" };
  if (operatorStore.get().networkSim === "failing") {
    return { ok: false, error: "Server rejected the request (simulated)" };
  }
  return { ok: true };
}

export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    while (operatorStore.isOnline()) {
      const intents = operatorStore.get().intents;
      if (intents.some((i) => i.state === "FAILED")) break;
      const next = intents.find((i) => i.state === "PENDING");
      if (!next) break;
      operatorStore.intents.update(next.id, { state: "SENDING", attempts: next.attempts + 1 });
      const result = await deliver();
      if (result.ok) {
        operatorStore.intents.update(next.id, { state: "CONFIRMED", lastError: null });
      } else if (!operatorStore.isOnline()) {
        operatorStore.intents.update(next.id, { state: "PENDING", lastError: result.error });
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
