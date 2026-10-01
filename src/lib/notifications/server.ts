import "server-only";
import { cookies } from "next/headers";
import { callerKey, publicMessage, serviceClient } from "@/lib/registration/server";

/*
 * Anonymous notification devices (server side).
 *
 * - A device is identified by a 256-bit random token generated in Postgres
 *   and handed to the browser ONLY as an httpOnly, Secure, SameSite=Lax
 *   cookie: page scripts cannot read it, other sites cannot send it with
 *   POSTs, and Postgres keeps only its SHA-256 hash.
 * - Every read/write goes through service_role functions with that token;
 *   browsers can never touch the notification tables.
 * - PUSH_NOTIFICATIONS_ENABLED (server-only) switches the whole feature.
 */

export const DEVICE_COOKIE = "eksu_alerts";
const MAX_AGE = 400 * 24 * 60 * 60; // the longest lifetime browsers accept

export { pushNotificationsEnabled } from "./flag";

export async function deviceToken(): Promise<string | null> {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
  return v && /^[A-Za-z0-9_-]{40,64}$/.test(v) ? v : null;
}

export async function setDeviceCookie(token: string | null) {
  const store = await cookies();
  if (token === null) store.delete(DEVICE_COOKIE);
  else
    store.set(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
}

export class NotifyError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

function db(): Rpc {
  const c = serviceClient();
  if (!c) throw new NotifyError("Notifications are not available right now.");
  return (fn, args) => c.rpc(fn, args) as unknown as ReturnType<Rpc>;
}

/** Token for this browser, registering a new anonymous device when there is none (or it is unknown). */
export async function ensureDevice(platform: string, standalone: boolean, fresh = false): Promise<string> {
  const existing = fresh ? null : await deviceToken();
  if (existing) return existing;
  const r = await db()("service_notify_register", { p_platform: platform, p_standalone: standalone, p_rate_key: await callerKey() });
  if (r.error) throw new NotifyError(publicMessage(r.error, "Notifications are not available right now."), r.error.code);
  const token = (r.data as { token: string }).token;
  await setDeviceCookie(token);
  return token;
}

/** Calls a device function; an unknown/expired token is replaced by a new device once. */
export async function withDevice<T>(
  fn: string,
  args: Record<string, unknown>,
  opts: { create: boolean; platform?: string; standalone?: boolean } = { create: true },
): Promise<T | null> {
  let token = opts.create ? await ensureDevice(opts.platform ?? "other", opts.standalone ?? false) : await deviceToken();
  if (!token) return null;
  const call = db();
  const rateKey = await callerKey();
  for (let attempt = 0; attempt < 2; attempt++) {
    const needsRate = fn !== "service_notify_state";
    const r = await call(fn, { p_token: token, ...args, ...(needsRate ? { p_rate_key: rateKey } : {}) });
    if (!r.error) return r.data as T;
    if (r.error.code === "EK401") {
      await setDeviceCookie(null);
      if (!opts.create) return null;
      token = await ensureDevice(opts.platform ?? "other", opts.standalone ?? false, true);
      continue;
    }
    throw new NotifyError(publicMessage(r.error, "Could not save your alert settings. Please try again."), r.error.code);
  }
  return null;
}

export async function forgetDevice() {
  await setDeviceCookie(null);
}
