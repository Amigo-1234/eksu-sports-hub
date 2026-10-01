/**
 * Notification preference vocabulary — shared by the browser, the server and
 * the tests. Postgres re-validates every key (private.valid_pref_events).
 */

export const PREF_KEYS = ["REMINDER", "KICKOFF", "GOAL", "YELLOW_CARD", "RED_CARD", "HALF_TIME", "SECOND_HALF", "FULL_TIME", "STATUS"] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

export const PREF_LABEL: Record<PrefKey, { label: string; hint?: string }> = {
  REMINDER: { label: "Match starting soon", hint: "15 minutes before kick-off" },
  KICKOFF: { label: "Kick-off" },
  GOAL: { label: "Goals", hint: "Including score corrections" },
  YELLOW_CARD: { label: "Yellow cards" },
  RED_CARD: { label: "Red cards" },
  HALF_TIME: { label: "Half-time" },
  SECOND_HALF: { label: "Second half" },
  FULL_TIME: { label: "Full-time" },
  STATUS: { label: "Postponed / cancelled / abandoned" },
};

/** Recommended when someone follows one match. */
export const MATCH_DEFAULTS: PrefKey[] = ["KICKOFF", "GOAL", "RED_CARD", "HALF_TIME", "FULL_TIME", "STATUS"];
/** Recommended when someone follows a team (applies to all its future matches). */
export const TEAM_DEFAULTS: PrefKey[] = ["REMINDER", "KICKOFF", "GOAL", "RED_CARD", "FULL_TIME", "STATUS"];

export function cleanPrefs(input: unknown): PrefKey[] | null {
  if (!Array.isArray(input) || input.length > PREF_KEYS.length) return null;
  const out = new Set<PrefKey>();
  for (const k of input) {
    if (typeof k !== "string" || !(PREF_KEYS as readonly string[]).includes(k)) return null;
    out.add(k as PrefKey);
  }
  return PREF_KEYS.filter((k) => out.has(k));
}

/** "Goals · Red cards · Full-time" (in canonical order). */
export function summarisePrefs(events: readonly string[]): string {
  const set = new Set(events);
  const short: Record<PrefKey, string> = {
    REMINDER: "Reminder",
    KICKOFF: "Kick-off",
    GOAL: "Goals",
    YELLOW_CARD: "Yellow cards",
    RED_CARD: "Red cards",
    HALF_TIME: "HT",
    SECOND_HALF: "2nd half",
    FULL_TIME: "FT",
    STATUS: "Postponements",
  };
  const parts = PREF_KEYS.filter((k) => set.has(k)).map((k) => short[k]);
  return parts.length ? parts.join(" · ") : "No alerts";
}

export interface FollowedMatch {
  match_id: string;
  enabled: boolean;
  events: PrefKey[];
  home: string;
  away: string;
  competition: string;
  scheduled_at: string;
  status: string;
}
export interface FollowedTeam {
  team_id: string;
  enabled: boolean;
  events: PrefKey[];
  name: string;
  short_name: string;
}
export interface NotificationState {
  push_enabled: boolean;
  matches: FollowedMatch[];
  teams: FollowedTeam[];
}
export const EMPTY_STATE: NotificationState = { push_enabled: false, matches: [], teams: [] };

/** Which alerts a device gets for a match: an explicit match setting wins, otherwise the union of followed teams. */
export function effectiveMatchPrefs(state: NotificationState, matchId: string, teamIds: string[]): { source: "match" | "team" | "none"; enabled: boolean; events: PrefKey[] } {
  const m = state.matches.find((x) => x.match_id === matchId);
  if (m) return { source: "match", enabled: m.enabled, events: m.events };
  const teams = state.teams.filter((t) => teamIds.includes(t.team_id) && t.enabled);
  if (teams.length) return { source: "team", enabled: true, events: PREF_KEYS.filter((k) => teams.some((t) => t.events.includes(k))) };
  return { source: "none", enabled: false, events: [] };
}

// ── Platform / support detection (pure, unit-tested) ─────────────────────────
export type PushSupport =
  | { kind: "supported" }
  | { kind: "ios-install" } // iPhone/iPad in a browser tab: must be added to the Home Screen first
  | { kind: "unsupported" };

export interface Env {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

export function isAppleMobile(e: Pick<Env, "userAgent" | "maxTouchPoints">): boolean {
  // iPadOS reports a desktop Mac user agent; touch points give it away.
  return /iPhone|iPad|iPod/.test(e.userAgent) || (/Macintosh/.test(e.userAgent) && e.maxTouchPoints > 1);
}

export function detectPushSupport(e: Env): PushSupport {
  const apis = e.hasServiceWorker && e.hasPushManager && e.hasNotification;
  if (isAppleMobile(e)) {
    // iOS/iPadOS 16.4+ allow Web Push only for Home Screen web apps.
    if (!e.standalone) return { kind: "ios-install" };
    return apis ? { kind: "supported" } : { kind: "unsupported" };
  }
  return apis ? { kind: "supported" } : { kind: "unsupported" };
}

export function platformOf(e: Pick<Env, "userAgent" | "maxTouchPoints">): "ios" | "android" | "desktop" | "other" {
  if (isAppleMobile(e)) return "ios";
  if (/Android/i.test(e.userAgent)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(e.userAgent)) return "desktop";
  return "other";
}
