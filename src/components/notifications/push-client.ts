"use client";

import { detectPushSupport, platformOf, type Env, type PushSupport } from "@/lib/notifications/prefs";

/*
 * Browser-side Web Push plumbing. Nothing here decides notification content:
 * it only asks for permission (on a user gesture), creates the browser's push
 * subscription and hands its public endpoint/keys to the server.
 */

export const SW_URL = "/sw.js";

export function browserEnv(): Env {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
  };
}

export function currentSupport(): { support: PushSupport; env: Env; platform: ReturnType<typeof platformOf> } {
  const env = browserEnv();
  return { support: detectPushSupport(env), env, platform: platformOf(env) };
}

export type Permission = NotificationPermission | "unsupported";

export function currentPermission(): Permission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Works with both the promise and the legacy callback form (older Safari). */
export function requestPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    const r = Notification.requestPermission((p) => resolve(p));
    if (r && typeof r.then === "function") r.then(resolve, () => resolve(Notification.permission));
  });
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export interface SubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * The browser's push subscription for our VAPID key — reusing a valid one,
 * replacing one made for a different key, or creating it.
 */
export async function ensureSubscription(vapidPublicKey: string): Promise<SubscriptionJSON> {
  const reg = (await registerWorker()) ?? (await navigator.serviceWorker.ready);
  const key = keyBytes(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("incomplete subscription");
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

export async function existingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

// ── Small per-browser conveniences (never authoritative) ─────────────────────
const LS = {
  known: "eksu-alerts:device", // this browser has registered alert settings
  state: "eksu-alerts:state", // last state from the server, for instant first paint
  synced: "eksu-alerts:synced", // last subscription sync (ms) + endpoint
  iosReady: "eksu-alerts:ios-ready-shown",
} as const;

export function store(key: keyof typeof LS, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(LS[key]);
    if (value === null) localStorage.removeItem(LS[key]);
    else localStorage.setItem(LS[key], value);
  } catch {
    // Private mode / storage blocked: the server stays authoritative.
  }
  return null;
}
