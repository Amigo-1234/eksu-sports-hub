/** Shared (client + server) shapes for the public site's light sign-in. */

export type VisitorRequest = { t: "seen" } | { t: "join"; name: string; contact: string | null };

export interface VisitorState {
  known: boolean;
  name?: string;
}

export const NAME_MAX = 40;
export const CONTACT_MAX = 120;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9]{7,15}$/;

/** Cleans a display name; null when empty or too long. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s && s.length <= NAME_MAX ? s : null;
}

/** "" → null; otherwise the email (lower-cased) or phone (digits) — or false when invalid. */
export function cleanContact(v: unknown): string | null | false {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return null;
  if (s.length <= CONTACT_MAX && EMAIL.test(s)) return s.toLowerCase();
  const digits = s.replace(/[\s().-]/g, "");
  return PHONE.test(digits) ? digits : false;
}

export function parseVisitorRequest(body: unknown): VisitorRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.t === "seen") return { t: "seen" };
  if (b.t !== "join") return null;
  const name = cleanName(b.name);
  const contact = cleanContact(b.contact);
  if (!name || contact === false) return null;
  return { t: "join", name, contact };
}
