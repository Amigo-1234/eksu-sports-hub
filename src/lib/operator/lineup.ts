/**
 * Line-up awareness for the operator console. The server is authoritative
 * (record_event validates against the confirmed line-up); these helpers
 * decide which shirts each flow offers, including events still queued on
 * this device.
 */
import type { PlayerStatus } from "./engine.ts";
import type { AssignmentSeed, Side } from "./types.ts";

export interface ConsolePlayer {
  shirt: number;
  name: string | null;
  /** Null when the team has no confirmed line-up (demo, or admin override). */
  role: "STARTER" | "SUBSTITUTE" | null;
}

export type ConsoleSquads = { home: ConsolePlayer[]; away: ConsolePlayer[] };

/** On the pitch now: started or came on, and neither substituted off nor sent off. */
export function isOnField(p: ConsolePlayer, s: PlayerStatus | undefined): boolean {
  if (s?.lastMove !== undefined) {
    // Special rules (rolling substitutions / temporary red cards): the latest movement decides.
    return s.lastMove === "ON" || s.lastMove === "RETURN";
  }
  if (s?.sentOff || s?.subbedOff || s?.suspended) return false;
  if (p.role === null) return true; // no line-up: unknown, offer everyone
  return p.role === "STARTER" || !!s?.subbedOn;
}

/**
 * Available to come on. Normal football: a named substitute who has not
 * entered or been dismissed. Rolling substitutions: anyone in the line-up who
 * is off the pitch and neither suspended nor excluded (players may return).
 */
export function isAvailableSub(p: ConsolePlayer, s: PlayerStatus | undefined, rolling = false): boolean {
  if (rolling) {
    if (s?.sentOff || s?.suspended) return false;
    return !isOnField(p, s);
  }
  if (s?.sentOff || s?.subbedOff || s?.subbedOn) return false;
  return p.role === null || p.role === "SUBSTITUTE";
}

/** Special rules: serving a temporary red-card suspension. */
export const isSuspended = (s: PlayerStatus | undefined): boolean => !!s?.suspended;

export function hasLineup(players: ConsolePlayer[]): boolean {
  return players.some((p) => p.role !== null);
}

/** Players the console offers for a side: the confirmed line-up, else the squad. */
export function consoleSquads(seed: AssignmentSeed): ConsoleSquads | null {
  if (!seed.squads) return null;
  const side = (s: Side): ConsolePlayer[] => {
    const lineup = seed.lineups?.[s];
    if (lineup?.status === "CONFIRMED") {
      return lineup.players.map((p) => ({ shirt: p.shirt, name: p.name, role: p.role })).sort((a, b) => a.shirt - b.shirt);
    }
    return (seed.squads?.[s] ?? []).map((p) => ({ shirt: p.shirt, name: p.name ?? null, role: null }));
  };
  return { home: side("home"), away: side("away") };
}
