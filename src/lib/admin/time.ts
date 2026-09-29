/**
 * Campus time (WAT, fixed UTC+1) ↔ <input type="datetime-local"> values.
 * Admins always type kick-offs in campus time, whatever their device's zone;
 * the database stores timestamptz (UTC).
 */
const WAT_OFFSET_MS = 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → "2026-10-04T16:00" in campus time. */
export function toWatInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const w = new Date(t + WAT_OFFSET_MS);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** "2026-10-04T16:00" (campus time) → ISO instant, or null when invalid. */
export function fromWatInput(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi) - WAT_OFFSET_MS;
  const check = new Date(utc + WAT_OFFSET_MS);
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return null; // e.g. 31 Feb
  return new Date(utc).toISOString();
}

/** Campus-day window [start, end) for a "YYYY-MM-DD" key, as ISO instants. */
export function watDayRange(key: string): { from: string; to: string } | null {
  const start = fromWatInput(`${key}T00:00`);
  if (!start) return null;
  return { from: start, to: new Date(new Date(start).getTime() + 86_400_000).toISOString() };
}

/** "Sat 4 Oct 2026, 16:00" in campus time. */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatWatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const w = new Date(t + WAT_OFFSET_MS);
  return `${DAYS[w.getUTCDay()]} ${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()}, ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** "Sat 4 Oct 2026" for a date-only value ("2026-10-04"). */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Request-time clock for server components (kept out of render bodies). */
export const serverNow = (): number => Date.now();
