"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { seedMatchState } from "./seed";
import { connectionStatus } from "./queue";
import { hydrate, operatorStore } from "./store";
import { now } from "./time";
import { startTransport } from "./transport";
import type { AssignmentSeed, OpMatchState, PrepChecks } from "./types";

export function useOperatorSnapshot() {
  return useSyncExternalStore(operatorStore.subscribe, operatorStore.get, operatorStore.getServer);
}

/** Mount once in the operator layout: loads device state and starts the queue. */
export function useOperatorRuntime() {
  useEffect(() => {
    hydrate();
    return startTransport();
  }, []);
}

/** Current state of an assigned match: this device's copy, else the server seed. */
export function useOpMatch(seed: AssignmentSeed): OpMatchState {
  const snap = useOperatorSnapshot();
  const seeded = useMemo(() => seedMatchState(seed.match), [seed.match]);
  useEffect(() => {
    if (snap.hydrated) operatorStore.ensureMatch(seeded);
  }, [snap.hydrated, seeded]);
  return snap.matches[seed.match.id] ?? seeded;
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

export const isPrepComplete = (p: PrepChecks) => p.atVenue && p.teamsPresent && p.officialsReady;
