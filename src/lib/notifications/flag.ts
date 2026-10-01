/**
 * PUSH_NOTIFICATIONS_ENABLED (server-only, default off) switches match alerts
 * on. It also needs the public VAPID key, or browsers could not subscribe.
 */
export function pushNotificationsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.PUSH_NOTIFICATIONS_ENABLED ?? "").trim()) && Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}
