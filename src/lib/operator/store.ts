/**
 * Client-side operator store (DEMO).
 *
 * Holds match states, prep checks and the intent queue for this browser.
 * It is mirrored to localStorage so a refresh doesn't lose a demo match —
 * that is device-local only; nothing is sent to a server.
 */
import type { Intent, IntentStore } from "./queue.ts";
import { createMemoryIntentStore } from "./queue.ts";
import type { OpMatchState, PrepChecks } from "./types.ts";

export type NetworkSim = "online" | "offline" | "failing";

export interface OperatorSnapshot {
  matches: Record<string, OpMatchState>;
  prep: Record<string, PrepChecks>;
  intents: Intent[];
  /** Demo control: simulated network behaviour. */
  networkSim: NetworkSim;
  /** Real browser reachability (navigator.onLine). */
  browserOnline: boolean;
  /** True once localStorage has been read on the client. */
  hydrated: boolean;
}

const STORAGE_KEY = "eksu-operator-demo-v1";

const EMPTY: OperatorSnapshot = {
  matches: {},
  prep: {},
  intents: [],
  networkSim: "online",
  browserOnline: true,
  hydrated: false,
};

let snapshot: OperatorSnapshot = EMPTY;
let intentStore: IntentStore = createMemoryIntentStore();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const { matches, prep, intents, networkSim } = snapshot;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ matches, prep, intents, networkSim }));
    } catch {
      // Storage full/blocked: the demo keeps working in memory.
    }
  }, 150);
}

function set(patch: Partial<OperatorSnapshot>) {
  snapshot = { ...snapshot, ...patch, intents: intentStore.all() };
  persist();
  emit();
}

export function hydrate() {
  if (snapshot.hydrated || typeof window === "undefined") return;
  let saved: Partial<OperatorSnapshot> = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    saved = {};
  }
  // Anything mid-flight when the page closed goes back to the queue.
  const intents = (saved.intents ?? []).map((i) => (i.state === "SENDING" ? { ...i, state: "PENDING" as const } : i));
  intentStore = createMemoryIntentStore(intents);
  snapshot = {
    matches: saved.matches ?? {},
    prep: saved.prep ?? {},
    intents: intentStore.all(),
    networkSim: saved.networkSim ?? "online",
    browserOnline: navigator.onLine,
    hydrated: true,
  };
  window.addEventListener("online", () => set({ browserOnline: true }));
  window.addEventListener("offline", () => set({ browserOnline: false }));
  emit();
}

export const operatorStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => snapshot,
  getServer: () => EMPTY,

  isOnline: () => snapshot.browserOnline && snapshot.networkSim !== "offline",

  setMatch(state: OpMatchState) {
    set({ matches: { ...snapshot.matches, [state.matchId]: state } });
  },
  /** Seed a match the first time this device sees it. */
  ensureMatch(state: OpMatchState) {
    if (!snapshot.hydrated || snapshot.matches[state.matchId]) return;
    set({ matches: { ...snapshot.matches, [state.matchId]: state } });
  },
  setPrep(matchId: string, prep: PrepChecks) {
    set({ prep: { ...snapshot.prep, [matchId]: prep } });
  },
  setNetworkSim(networkSim: NetworkSim) {
    set({ networkSim });
  },

  intents: {
    put(intent: Intent) {
      intentStore.put(intent);
      set({});
    },
    update(id: string, patch: Partial<Intent>) {
      intentStore.update(id, patch);
      set({});
    },
  },

  /** Demo reset: forget local state for one match (or everything). */
  reset(matchId?: string) {
    if (matchId) {
      const matches = { ...snapshot.matches };
      const prep = { ...snapshot.prep };
      delete matches[matchId];
      delete prep[matchId];
      intentStore.clearMatch(matchId);
      set({ matches, prep });
    } else {
      intentStore = createMemoryIntentStore();
      set({ matches: {}, prep: {}, networkSim: "online" });
    }
  },
};
