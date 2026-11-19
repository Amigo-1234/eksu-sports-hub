"use client";

import { useSyncExternalStore } from "react";
import { useAlerts } from "@/components/notifications/AlertsProvider";

/*
 * My Teams: the clubs a fan follows on this browser (no account). Stored in
 * localStorage; teams followed for alerts count too, so existing followers
 * see their teams straight away.
 */

const KEY = "eksu-my-teams-v1";
const MAX = 12;
const EMPTY: string[] = [];
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(ids: string[]) {
  cache = ids.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode: keeps working for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function toggleMyTeam(id: string) {
  const ids = read();
  write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

/** Starred teams plus teams with alerts on, starred first. */
export function useMyTeams(): string[] {
  const starred = useSyncExternalStore(subscribe, read, () => EMPTY);
  const alerts = useAlerts();
  const followed = alerts.state.teams.filter((t) => t.enabled).map((t) => t.team_id);
  const extra = followed.filter((id) => !starred.includes(id));
  return extra.length ? [...starred, ...extra] : starred;
}

export function useIsStarred(id: string): boolean {
  return useSyncExternalStore(subscribe, read, () => EMPTY).includes(id);
}
