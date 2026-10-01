/*
 * EKSU Sports Hub service worker — push notifications only.
 *
 * Deliberately does NOT cache pages or intercept fetches: live scores must
 * always come from the network. It shows server-authored notifications,
 * routes taps to the right match, and re-registers a rotated subscription.
 */

const ICON = "/brand/eksu-crest-192.png";
const FALLBACK_TITLE = "EKSU Sports Hub";

/** Only same-origin paths may be opened from a notification. */
function safePath(url) {
  return typeof url === "string" && /^\/(?!\/)[A-Za-z0-9\-._~/?=&%#]*$/.test(url) ? url : "/";
}

function parsePush(data) {
  let d = {};
  if (data) {
    try {
      d = data.json() || {};
    } catch {
      try {
        d = { body: data.text() };
      } catch {
        d = {};
      }
    }
  }
  const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    title: text(d.title, 120) || FALLBACK_TITLE,
    body: text(d.body, 300),
    url: safePath(d.url),
    tag: text(d.tag, 120) || undefined,
  };
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const n = parsePush(event.data);
  // Every push MUST show a notification (userVisibleOnly), or browsers revoke the subscription.
  event.waitUntil(
    self.registration.showNotification(n.title, {
      body: n.body,
      icon: ICON,
      badge: ICON,
      tag: n.tag,
      // A replacement under the same tag (e.g. a score correction) should alert again.
      renotify: Boolean(n.tag),
      timestamp: Date.now(),
      data: { url: n.url },
    }),
  );
});

async function openPath(path) {
  const target = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const exact = windows.find((c) => c.url === target);
  if (exact) return exact.focus();
  const any = windows.find((c) => new URL(c.url).origin === self.location.origin);
  if (any) {
    try {
      const focused = await any.focus();
      return await (focused || any).navigate(target);
    } catch {
      // navigate() can fail for uncontrolled clients; fall back to a new window.
    }
  }
  return self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openPath(safePath(event.notification.data && event.notification.data.url)));
});

/** The push service rotated or expired our subscription: subscribe again and tell the server. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      let sub = event.newSubscription || null;
      if (!sub) {
        const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
        if (!key) return;
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await fetch("/api/notifications/subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
    })().catch(() => {
      // The page re-checks the subscription on its next visit.
    }),
  );
});

// Exposed for unit tests (node vm); harmless in browsers.
self.__eksuPush = { safePath, parsePush, openPath };
