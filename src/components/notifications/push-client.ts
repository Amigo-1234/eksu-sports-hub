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

/** Which step of browser push setup failed (for diagnostics only; never shown to users). */
export class PushSetupError extends Error {
  constructor(
    public step: "register" | "ready" | "key" | "getSubscription" | "subscribe" | "serialize",
    public cause: unknown,
  ) {
    super(`push setup failed at ${step}`);
  }
}

async function step<T>(name: PushSetupError["step"], run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw e instanceof PushSetupError ? e : new PushSetupError(name, e);
  }
}

/** The VAPID public key as bytes: an uncompressed P-256 point (65 bytes, 0x04 prefix). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url.trim() + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  if (out.length !== 65 || out[0] !== 4) throw new Error(`invalid VAPID public key (length ${out.length})`);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/**
 * A registration with an ACTIVE service worker. Safari (iOS Home Screen apps
 * included) rejects pushManager.subscribe() while the worker is still
 * installing, so a freshly registered worker must be awaited.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await step("register", () => navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" }));
  if (reg.active) return reg;
  return step("ready", () =>
    Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("service worker did not activate within 15s")), 15_000)),
    ]),
  );
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
  const key = await step("key", () => keyBytes(vapidPublicKey));
  const reg = await activeRegistration();
  let sub = await step("getSubscription", () => reg.pushManager.getSubscription());
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) sub = await step("subscribe", () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  return step("serialize", () => {
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("incomplete subscription");
    return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
  });
}

/**
 * Best-effort diagnostics for a failed setup: step + the browser's error
 * name/message (truncated) and environment flags. Never keys, endpoints or
 * tokens. Users only ever see the generic message.
 */
export function reportPushFailure(err: unknown, context: { platform: string; standalone: boolean }) {
  try {
    const e = err instanceof PushSetupError ? err.cause : err;
    const body = {
      step: err instanceof PushSetupError ? err.step : "save",
      name: e instanceof Error ? e.name : typeof e,
      message: (e instanceof Error ? e.message : String(e)).slice(0, 200),
      permission: currentPermission(),
      platform: context.platform,
      standalone: context.standalone,
      hasPushManager: "PushManager" in window,
      controlled: Boolean(navigator.serviceWorker?.controller),
    };
    void fetch("/api/notifications/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // diagnostics must never throw
  }
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
