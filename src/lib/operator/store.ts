/**
 * Client-side operator store.
 *
 * - supabase backend: a CACHE + optimistic layer. `canonical` holds the last
 *   server state; `matches` = canonical + replay of still-pending intents.
 *   The server is the source of truth; a refresh reloads it.
 * - mock backend: the demo's only state (device-local).
 *
 * The intent queue is mirrored to localStorage so queued actions survive a
 * reload (IndexedDB replaces this later behind the same IntentStore seam).
 */
import { operatorBackendConfig } from "./backend.ts";
import { applyCommand } from "./engine.ts";
import type { Intent, IntentStore } from "./queue.ts";
import { createMemoryIntentStore } from "./queue.ts";
import type { OpMatchState, PrepChecks, SquadMember } from "./types.ts";

export type NetworkSim = "online" | "offline" | "failing";

export interface OperatorSnapshot {
  /** Displayed (optimistic) state per match. */
  matches: Record<string, OpMatchState>;
  /** Last authoritative server state per match (supabase backend). */
  canonical: Record<string, OpMatchState>;
  /** Whether this user controls the match (supabase backend). */
  inControl: Record<string, boolean>;
  squads: Record<string, { home: SquadMember[]; away: SquadMember[] }>;
  teams: Record<string, { home: string; away: string }>;
  prep: Record<string, PrepChecks>;
  intents: Intent[];
  /** Developer control: simulated network behaviour. */
  networkSim: NetworkSim;
  /** Real browser reachability (navigator.onLine). */
  browserOnline: boolean;
  /** True once localStorage has been read on the client. */
  hydrated: boolean;
}

function storageKey() {
  const cfg = operatorBackendConfig();
  return `eksu-operator-${cfg.ok ? cfg.kind : "unconfigured"}-v2`;
}

const EMPTY: OperatorSnapshot = {
  matches: {},
  canonical: {},
  inControl: {},
  squads: {},
  teams: {},
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
  // Never write before the saved cache/queue has been read.
  if (typeof window === "undefined" || !snapshot.hydrated) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const { matches, canonical, prep, intents, networkSim } = snapshot;
      window.localStorage.setItem(storageKey(), JSON.stringify({ matches, canonical, prep, intents, networkSim }));
    } catch {
      // Storage full/blocked: keep working in memory.
    }
  }, 150);
}

function set(patch: Partial<OperatorSnapshot>) {
  snapshot = { ...snapshot, ...patch, intents: intentStore.all() };
  persist();
  emit();
}

/** Canonical state + replay of intents the server hasn't confirmed yet. */
function rebase(matchId: string, base: OpMatchState): OpMatchState {
  let state = base;
  for (const i of intentStore.all()) {
    if (i.matchId !== matchId || i.state === "CONFIRMED") continue;
    const r = applyCommand(state, i.args, { now: i.clientTimestamp, newId: () => i.id, intentId: i.id });
    if (r.ok) state = r.state;
  }
  return state;
}

export function hydrate() {
  if (snapshot.hydrated || typeof window === "undefined") return;
  let saved: Partial<OperatorSnapshot> = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(storageKey()) ?? "{}");
  } catch {
    saved = {};
  }
  // Anything mid-flight when the page closed goes back to the queue.
  const intents = (saved.intents ?? []).map((i) => (i.state === "SENDING" ? { ...i, state: "PENDING" as const } : i));
  intentStore = createMemoryIntentStore(intents);
  snapshot = {
    ...EMPTY,
    // Seeds from the server (set before hydration) win over the saved cache.
    ...snapshot,
    matches: { ...(saved.matches ?? {}), ...snapshot.matches },
    canonical: { ...(saved.canonical ?? {}), ...snapshot.canonical },
    prep: { ...(saved.prep ?? {}), ...snapshot.prep },
    intents: intentStore.all(),
    networkSim: saved.networkSim ?? "online",
    browserOnline: navigator.onLine,
    hydrated: true,
  };
  for (const id of Object.keys(snapshot.canonical)) {
    snapshot.matches[id] = rebase(id, snapshot.canonical[id]);
  }
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
  /** Mock backend: seed a match the first time this device sees it. */
  ensureMatch(state: OpMatchState) {
    if (!snapshot.hydrated || snapshot.matches[state.matchId]) return;
    set({ matches: { ...snapshot.matches, [state.matchId]: state } });
  },
  /** Match context needed to map shirts/sides onto server ids. */
  setContext(matchId: string, ctx: { teams: { home: string; away: string }; squads?: { home: SquadMember[]; away: SquadMember[] } }) {
    set({
      teams: { ...snapshot.teams, [matchId]: ctx.teams },
      ...(ctx.squads ? { squads: { ...snapshot.squads, [matchId]: ctx.squads } } : {}),
    });
  },
  /**
   * Accept authoritative state from the server. Ignores anything older than
   * what we already hold, then re-applies still-pending local intents.
   */
  reconcile(matchId: string, canonical: OpMatchState, inControl?: boolean) {
    intentStore.prune(Date.now() - 5 * 60_000);
    const known = snapshot.canonical[matchId];
    const base = known && known.version > canonical.version ? known : canonical;
    set({
      canonical: { ...snapshot.canonical, [matchId]: base },
      matches: { ...snapshot.matches, [matchId]: rebase(matchId, base) },
      ...(inControl !== undefined ? { inControl: { ...snapshot.inControl, [matchId]: inControl } } : {}),
    });
  },
  setInControl(matchId: string, value: boolean) {
    set({ inControl: { ...snapshot.inControl, [matchId]: value } });
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
    /** Drop an intent the server rejected; displayed state rolls back. */
    discard(id: string) {
      const intent = intentStore.all().find((i) => i.id === id);
      intentStore.remove(id);
      const base = intent ? snapshot.canonical[intent.matchId] : undefined;
      if (intent && base) {
        set({ matches: { ...snapshot.matches, [intent.matchId]: rebase(intent.matchId, base) } });
      } else set({});
    },
  },

  /** Forget local state for one match (or everything). Server data is untouched. */
  reset(matchId?: string) {
    if (matchId) {
      const matches = { ...snapshot.matches };
      const canonical = { ...snapshot.canonical };
      const prep = { ...snapshot.prep };
      delete matches[matchId];
      delete canonical[matchId];
      delete prep[matchId];
      intentStore.clearMatch(matchId);
      set({ matches, canonical, prep });
    } else {
      intentStore = createMemoryIntentStore();
      set({ matches: {}, canonical: {}, prep: {}, networkSim: "online" });
    }
  },
};
