"use server";

import { cleanPrefs, EMPTY_STATE, type NotificationState } from "@/lib/notifications/prefs";
import { NotifyError, pushNotificationsEnabled, withDevice } from "@/lib/notifications/server";
import { isUuid } from "@/lib/registration/rules";

/*
 * Anonymous alert settings. The browser only ever chooses WHAT to follow and
 * WHICH event types; the device is identified by its httpOnly cookie, and the
 * server decides every notification's content from canonical match data.
 */

export type ActionResult = { ok: true; state: NotificationState } | { ok: false; error: string };

const OFF = "Match alerts are temporarily unavailable.";
const platformOk = (p: unknown) => (p === "ios" || p === "android" || p === "desktop" ? p : "other");

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  if (!pushNotificationsEnabled()) return { ok: false, error: OFF };
  try {
    await fn();
    const state = await withDevice<NotificationState>("service_notify_state", {}, { create: false });
    return { ok: true, state: state ?? EMPTY_STATE };
  } catch (e) {
    return { ok: false, error: e instanceof NotifyError ? e.message : "Could not save your alert settings. Please try again." };
  }
}

/** This device's follows (never creates a device). */
export async function getAlertState(): Promise<ActionResult> {
  if (!pushNotificationsEnabled()) return { ok: false, error: OFF };
  try {
    return { ok: true, state: (await withDevice<NotificationState>("service_notify_state", {}, { create: false })) ?? EMPTY_STATE };
  } catch {
    return { ok: true, state: EMPTY_STATE };
  }
}

export async function saveMatchAlerts(matchId: string, enabled: boolean, events: string[]): Promise<ActionResult> {
  const prefs = cleanPrefs(events);
  if (!isUuid(matchId) || !prefs) return { ok: false, error: "Choose at least one valid alert." };
  return run(async () => {
    await withDevice("service_notify_set_match", { p_match_id: matchId, p_enabled: Boolean(enabled), p_events: prefs });
  });
}

export async function removeMatchAlerts(matchId: string): Promise<ActionResult> {
  if (!isUuid(matchId)) return { ok: false, error: "Unknown match." };
  return run(async () => {
    await withDevice("service_notify_remove_match", { p_match_id: matchId }, { create: false });
  });
}

export async function saveTeamAlerts(teamId: string, events: string[]): Promise<ActionResult> {
  const prefs = cleanPrefs(events);
  if (!isUuid(teamId) || !prefs) return { ok: false, error: "Choose at least one valid alert." };
  return run(async () => {
    await withDevice("service_notify_set_team", { p_team_id: teamId, p_enabled: true, p_events: prefs });
  });
}

export async function unfollowTeam(teamId: string): Promise<ActionResult> {
  if (!isUuid(teamId)) return { ok: false, error: "Unknown team." };
  return run(async () => {
    await withDevice("service_notify_remove_team", { p_team_id: teamId }, { create: false });
  });
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Store this browser's push subscription (after the user granted permission). */
export async function saveSubscription(sub: SubscriptionInput, platform: string, standalone: boolean): Promise<ActionResult> {
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint.slice(0, 1024) : "";
  if (!/^https:\/\/\S+$/.test(endpoint) || typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string") {
    return { ok: false, error: "This browser returned an invalid push subscription." };
  }
  return run(async () => {
    await withDevice(
      "service_notify_set_subscription",
      { p_endpoint: endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_platform: platformOk(platform), p_standalone: Boolean(standalone) },
      { create: true, platform: platformOk(platform), standalone: Boolean(standalone) },
    );
  });
}

/** Turn everything off for this device: subscription dropped server-side and all follows removed. */
export async function disableAllAlerts(): Promise<ActionResult> {
  return run(async () => {
    await withDevice("service_notify_disable_all", {}, { create: false });
  });
}
