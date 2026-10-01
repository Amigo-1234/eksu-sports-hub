/**
 * PUSH_NOTIFICATIONS_ENABLED (server-only, default off) switches match alerts
 * on. It also needs the public VAPID key, or browsers could not subscribe.
 */
export function pushNotificationsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.PUSH_NOTIFICATIONS_ENABLED ?? "").trim()) && Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

/**
 * A VAPID key as web-push expects it (URL-safe base64, no padding). Pasted
 * values are forgiven surrounding whitespace/quotes, `=` padding and the
 * standard `+` `/` alphabet; anything else is left for the self-check to flag.
 */
export function normaliseVapidKey(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .trim()
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
