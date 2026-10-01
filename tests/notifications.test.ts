import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { classify } from "../src/lib/notifications/delivery.ts";
import { pushNotificationsEnabled } from "../src/lib/notifications/flag.ts";
import {
  cleanPrefs,
  detectPushSupport,
  effectiveMatchPrefs,
  MATCH_DEFAULTS,
  platformOf,
  summarisePrefs,
  TEAM_DEFAULTS,
  type Env,
  type NotificationState,
} from "../src/lib/notifications/prefs.ts";

// ── Preferences ─────────────────────────────────────────────────────────────
test("match defaults: kick-off, goals, red cards, HT, FT, postponements on; yellows, 2nd half, reminder off", () => {
  assert.deepEqual([...MATCH_DEFAULTS].sort(), ["FULL_TIME", "GOAL", "HALF_TIME", "KICKOFF", "RED_CARD", "STATUS"]);
});

test("team defaults: reminder, kick-off, goals, red cards, FT, postponements", () => {
  assert.deepEqual([...TEAM_DEFAULTS].sort(), ["FULL_TIME", "GOAL", "KICKOFF", "RED_CARD", "REMINDER", "STATUS"]);
});

test("cleanPrefs accepts only the known vocabulary, dedupes and orders canonically", () => {
  assert.deepEqual(cleanPrefs(["GOAL", "KICKOFF", "GOAL"]), ["KICKOFF", "GOAL"]);
  assert.deepEqual(cleanPrefs([]), []);
  assert.equal(cleanPrefs(["GOAL", "SUBSTITUTION"]), null);
  assert.equal(cleanPrefs(["<script>"]), null);
  assert.equal(cleanPrefs("GOAL"), null);
  assert.equal(cleanPrefs([1]), null);
  assert.equal(cleanPrefs(new Array(50).fill("GOAL")), null);
});

test("summarisePrefs is short and ordered", () => {
  assert.equal(summarisePrefs(["FULL_TIME", "GOAL", "KICKOFF"]), "Kick-off · Goals · FT");
  assert.equal(summarisePrefs([]), "No alerts");
});

const state = (s: Partial<NotificationState>): NotificationState => ({ push_enabled: true, matches: [], teams: [], ...s });
const team = (team_id: string, events: string[], enabled = true) => ({ team_id, events, enabled, name: team_id, short_name: team_id }) as NotificationState["teams"][number];
const match = (match_id: string, events: string[], enabled = true) =>
  ({ match_id, events, enabled, home: "H", away: "A", competition: "C", scheduled_at: "2026-10-01T12:00:00Z", status: "SCHEDULED" }) as NotificationState["matches"][number];

test("a match setting overrides team follows — including muting", () => {
  const s = state({ teams: [team("home", ["GOAL", "KICKOFF"])], matches: [match("m", [], false)] });
  assert.deepEqual(effectiveMatchPrefs(s, "m", ["home", "away"]), { source: "match", enabled: false, events: [] });
  const s2 = state({ teams: [team("home", ["GOAL", "KICKOFF"])], matches: [match("m", ["YELLOW_CARD"])] });
  assert.deepEqual(effectiveMatchPrefs(s2, "m", ["home", "away"]).events, ["YELLOW_CARD"]);
});

test("following both teams gives the union of their alerts (one set, no duplicates)", () => {
  const s = state({ teams: [team("home", ["GOAL", "KICKOFF"]), team("away", ["GOAL", "FULL_TIME"])] });
  assert.deepEqual(effectiveMatchPrefs(s, "m", ["home", "away"]), { source: "team", enabled: true, events: ["KICKOFF", "GOAL", "FULL_TIME"] });
  assert.equal(effectiveMatchPrefs(s, "m", ["other", "x"]).source, "none");
});

// ── Platform detection ──────────────────────────────────────────────────────
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const all = { hasServiceWorker: true, hasPushManager: true, hasNotification: true };
const env = (e: Partial<Env>): Env => ({ userAgent: ANDROID, maxTouchPoints: 0, standalone: false, ...all, ...e });

test("iPhone in a Safari tab → install guidance (never a permission prompt)", () => {
  assert.equal(detectPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5, hasPushManager: false, hasNotification: false })).kind, "ios-install");
  assert.equal(detectPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5 })).kind, "ios-install");
});

test("iPadOS with a desktop user agent is still treated as iOS", () => {
  assert.equal(detectPushSupport(env({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 })).kind, "ios-install");
  assert.equal(platformOf({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 }), "ios");
  // A real Mac (no touch) is desktop Safari, which supports Web Push in a tab.
  assert.equal(detectPushSupport(env({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 })).kind, "supported");
  assert.equal(platformOf({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 }), "desktop");
});

test("iPhone Home Screen app → supported (or unsupported on iOS < 16.4)", () => {
  assert.equal(detectPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).kind, "supported");
  assert.equal(detectPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true, hasPushManager: false })).kind, "unsupported");
});

test("Android / desktop: supported when the APIs exist, otherwise unsupported", () => {
  assert.equal(detectPushSupport(env({})).kind, "supported");
  assert.equal(detectPushSupport(env({ hasPushManager: false })).kind, "unsupported");
  assert.equal(detectPushSupport(env({ hasServiceWorker: false })).kind, "unsupported");
  assert.equal(platformOf({ userAgent: ANDROID, maxTouchPoints: 5 }), "android");
});

// ── Delivery classification ─────────────────────────────────────────────────
test("push-service responses: 2xx sent, 404/410 gone, 408/429/5xx/network retry, other 4xx failed", () => {
  assert.equal(classify(201), "SENT");
  assert.equal(classify(410), "GONE");
  assert.equal(classify(404), "GONE");
  assert.equal(classify(429), "RETRY");
  assert.equal(classify(503), "RETRY");
  assert.equal(classify(undefined), "RETRY");
  assert.equal(classify(400), "FAILED");
  assert.equal(classify(403), "FAILED");
  assert.equal(classify(413), "FAILED");
});

test("feature flag: off by default, needs the flag AND the public VAPID key", () => {
  assert.equal(pushNotificationsEnabled({}), false);
  assert.equal(pushNotificationsEnabled({ PUSH_NOTIFICATIONS_ENABLED: "true" }), false);
  assert.equal(pushNotificationsEnabled({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BK" }), false);
  assert.equal(pushNotificationsEnabled({ PUSH_NOTIFICATIONS_ENABLED: "true", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BK" }), true);
  assert.equal(pushNotificationsEnabled({ PUSH_NOTIFICATIONS_ENABLED: "false", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BK" }), false);
});

// ── Service worker (public/sw.js) in a sandbox ──────────────────────────────
function loadWorker(windows: { url: string; focused?: boolean }[] = []) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const calls: string[] = [];
  const fetches: { url: string; body: string }[] = [];
  const clients = windows.map((w) => ({
    url: w.url,
    focus: async function () { calls.push(`focus ${this.url}`); return this; },
    navigate: async function (u: string) { calls.push(`navigate ${u}`); return this; },
  }));
  const self: Record<string, unknown> = {
    location: { origin: "https://sports.example" },
    addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn),
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => shown.push({ title, options }),
      pushManager: { subscribe: async () => ({ toJSON: () => ({ endpoint: "https://push.example/new", keys: { p256dh: "p", auth: "a" } }) }) },
    },
    clients: {
      claim: async () => undefined,
      matchAll: async () => clients,
      openWindow: async (u: string) => calls.push(`open ${u}`),
    },
  };
  const sandbox = { self, URL, fetch: async (url: string, init: { body: string }) => fetches.push({ url, body: init.body }), Date, JSON };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), sandbox);
  async function fire(type: string, event: Record<string, unknown>) {
    let done: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  }
  return { fire, shown, calls, fetches, api: self.__eksuPush as { safePath: (u: unknown) => string } };
}
const pushData = (obj: unknown) => ({ json: () => obj, text: () => JSON.stringify(obj) });

test("SW: a push shows the server's notification, tagged, opening the match", async () => {
  const w = loadWorker();
  await w.fire("push", { data: pushData({ title: "GOAL ⚽", body: "Science 1–0 Engineering\n12'", url: "/matches/abc", tag: "EVT:1", type: "GOAL" }) });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, "GOAL ⚽");
  assert.equal(w.shown[0].options.tag, "EVT:1");
  assert.equal(w.shown[0].options.renotify, true);
  assert.equal(JSON.stringify(w.shown[0].options.data), JSON.stringify({ url: "/matches/abc" }));
});

test("SW: always shows something, even for an empty or malformed push", async () => {
  const w = loadWorker();
  await w.fire("push", { data: null });
  await w.fire("push", { data: { json: () => { throw new Error("bad"); }, text: () => "plain text" } });
  assert.equal(w.shown.length, 2);
  assert.equal(w.shown[0].title, "EKSU Sports Hub");
  assert.equal(w.shown[1].options.body, "plain text");
});

test("SW: never opens another site from a notification", () => {
  const { api } = loadWorker();
  assert.equal(api.safePath("/matches/abc"), "/matches/abc");
  assert.equal(api.safePath("https://evil.example/x"), "/");
  assert.equal(api.safePath("//evil.example/x"), "/");
  assert.equal(api.safePath("javascript:alert(1)"), "/");
  assert.equal(api.safePath(undefined), "/");
});

test("SW: tapping focuses the open match tab, else reuses a window, else opens one", async () => {
  const click = (url: string) => ({ notification: { close: () => undefined, data: { url } } });
  const exact = loadWorker([{ url: "https://sports.example/" }, { url: "https://sports.example/matches/abc" }]);
  await exact.fire("notificationclick", click("/matches/abc"));
  assert.deepEqual(exact.calls, ["focus https://sports.example/matches/abc"]);

  const other = loadWorker([{ url: "https://sports.example/fixtures" }]);
  await other.fire("notificationclick", click("/matches/abc"));
  assert.deepEqual(other.calls, ["focus https://sports.example/fixtures", "navigate https://sports.example/matches/abc"]);

  const none = loadWorker([]);
  await none.fire("notificationclick", click("/matches/abc"));
  assert.deepEqual(none.calls, ["open https://sports.example/matches/abc"]);
});

test("SW: a rotated subscription is re-sent to the server for this device", async () => {
  const w = loadWorker();
  await w.fire("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: new Uint8Array([4]).buffer } } });
  assert.equal(w.fetches.length, 1);
  assert.equal(w.fetches[0].url, "/api/notifications/subscription");
  assert.match(w.fetches[0].body, /push\.example\/new/);
});
