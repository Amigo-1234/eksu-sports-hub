/**
 * PUSH_NOTIFICATIONS_ENABLED (server-only, default off) switches match alerts
 * on. The VAPID key pair itself lives in Supabase Vault (see ./vapid.ts).
 */
export function pushNotificationsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.PUSH_NOTIFICATIONS_ENABLED ?? "").trim());
}

