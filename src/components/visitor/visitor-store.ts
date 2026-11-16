/*
 * Client-side state for the light sign-in. The name is cached in localStorage
 * so returning visitors never see the welcome screen flash; the server (device
 * cookie) stays the source of truth.
 *
 * status: "checking" (asking the server), "needed" (show the welcome screen),
 * "done" (signed in, or the feature is off). The first-visit onboarding waits
 * for "done" so the two overlays never stack.
 */

export const VISITOR_KEY = "eksu-visitor-v1";

export type GateStatus = "checking" | "needed" | "done";

interface Cached {
  name: string;
  seen?: string; // WAT date of the last visit we reported
}

let status: GateStatus | null = null;
const listeners = new Set<() => void>();

export function readVisitor(): Cached | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Cached;
    return typeof v?.name === "string" && v.name ? v : null;
  } catch {
    return null;
  }
}

export function writeVisitor(v: Cached) {
  try {
    localStorage.setItem(VISITOR_KEY, JSON.stringify(v));
  } catch {
    /* private mode — the cookie still identifies the device */
  }
}

export function gateStatus(): GateStatus {
  if (status === null) status = readVisitor() ? "done" : "checking";
  return status;
}

export function setGateStatus(s: GateStatus) {
  if (status === s) return;
  status = s;
  listeners.forEach((l) => l());
}

export function subscribeGate(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Today's date in West Africa Time, YYYY-MM-DD. */
export function todayWat(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}
