import "server-only";
import { timingSafeEqual } from "node:crypto";

/** `Authorization: Bearer NOTIFICATIONS_DISPATCH_SECRET` (constant-time compare). */
export function dispatchAuthorised(request: Request): boolean {
  const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || secret.length < 32 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
