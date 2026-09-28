"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { operatorControl } from "./actions";
import { operatorBackendConfig } from "./backend";
import { getOperatorBackend } from "./backends";
import { connectionStatus } from "./queue";
import { seedMatchState } from "./seed";
import { hydrate, operatorStore } from "./store";
import { now, setServerOffset } from "./time";
import { startTransport } from "./transport";
import type { AssignmentSeed, OpMatchState, PrepChecks } from "./types";

export function useOperatorSnapshot() {
  return useSyncExternalStore(operatorStore.subscribe, operatorStore.get, operatorStore.getServer);
}

export function backendKind() {
  const cfg = operatorBackendConfig();
  return cfg.ok ? cfg.kind : null;
}

/** Mount once in the operator layout: loads device state, starts the queue, syncs server time. */
export function useOperatorRuntime() {
  useEffect(() => {
    hydrate();
    const stop = startTransport();
    const backend = getOperatorBackend();
    if (backend.measureServerOffset) {
      void backend.measureServerOffset().then((offset) => {
        if (offset !== null) setServerOffset(offset);
      });
    }
    return stop;
  }, []);
}

/** Starting state for a seed: server canonical state, or the mock demo seed. */
export function seedState(seed: AssignmentSeed): OpMatchState {
  return seed.canonical ?? seedMatchState(seed.match);
}

/**
 * Current state of an assigned match. Supabase: the server state delivered
 * with the page is reconciled into the store (it wins over any local cache),
 * then pending local intents are replayed on top.
 */
export function useOpMatch(seed: AssignmentSeed): OpMatchState {
  const snap = useOperatorSnapshot();
  const initial = useMemo(() => seedState(seed), [seed]);
  const matchId = seed.match.id;

  useEffect(() => {
    operatorStore.setContext(matchId, {
      teams: { home: seed.match.homeTeamId, away: seed.match.awayTeamId },
      squads: seed.squads,
    });
    if (seed.canonical) operatorStore.reconcile(matchId, seed.canonical, seed.inControl);
  }, [matchId, seed]);

  useEffect(() => {
    if (snap.hydrated && !seed.canonical) operatorStore.ensureMatch(initial);
  }, [snap.hydrated, seed.canonical, initial]);

  return snap.matches[matchId] ?? initial;
}

/** Keep an open console in step with other devices (until Realtime lands). */
export function useCanonicalSync(matchId: string) {
  useEffect(() => {
    if (backendKind() !== "supabase") return;
    const idle = () => !operatorStore.get().intents.some((i) => i.matchId === matchId && i.state !== "CONFIRMED");
    const tick = () => {
      if (document.visibilityState === "visible" && idle()) void operatorControl.refresh(matchId);
    };
    const timer = setInterval(tick, 10_000);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [matchId]);
}

export function usePrep(seed: AssignmentSeed): PrepChecks {
  const snap = useOperatorSnapshot();
  return snap.prep[seed.match.id] ?? seed.assignment.prep;
}

export function useConnection() {
  const snap = useOperatorSnapshot();
  const online = snap.browserOnline && snap.networkSim !== "offline";
  return { online, status: connectionStatus(online, snap.intents), snap };
}

/* Shared 1-second ticker for clock displays. */
let current = 0;
const tickListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribeTick(l: () => void) {
  tickListeners.add(l);
  if (!timer) {
    current = now();
    timer = setInterval(() => {
      current = now();
      tickListeners.forEach((x) => x());
    }, 1000);
  }
  return () => {
    tickListeners.delete(l);
    if (!tickListeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** `now` for rendering; 0 during server render (show a placeholder). */
export function useNow(): number {
  return useSyncExternalStore(subscribeTick, () => current || now(), () => 0);
}

export const isPrepComplete = (p: PrepChecks) => !!(p.atVenue && p.teamsPresent && p.officialsReady);
