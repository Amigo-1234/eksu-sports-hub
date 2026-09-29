/**
 * Offset between this device's clock and the database clock. Every realtime
 * resync reports the server's time; the displayed minute is always derived
 * from server timestamps + (device now + offset) — never a counter.
 */
let offsetMs = 0;
const listeners = new Set<() => void>();

export function setServerTime(serverIso: string | null | undefined, sentAt = Date.now()): void {
  const t = serverIso ? Date.parse(serverIso) : NaN;
  if (Number.isNaN(t)) return;
  // Midpoint of the request is the best local estimate of when the server read its clock.
  const next = t - (sentAt + Date.now()) / 2;
  if (Math.abs(next - offsetMs) < 250) return;
  offsetMs = next;
  listeners.forEach((l) => l());
}

export const serverNow = (): number => Date.now() + offsetMs;

export function onServerTimeChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
