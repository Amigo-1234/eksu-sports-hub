/**
 * Date/time formatting. All match times are shown in campus time (WAT) no
 * matter where the viewer's device is, so server and client render the same.
 */
export const CAMPUS_TIME_ZONE = "Africa/Lagos";

/*
 * WAT is a fixed UTC+1 with no daylight saving, so formatting is done by hand
 * rather than with Intl — Node and browsers ship different ICU data and would
 * otherwise render different strings (and break hydration).
 */
const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

/** A Date whose UTC fields read as campus wall-clock time. */
const wat = (v: string | number | Date) => new Date(new Date(v).getTime() + WAT_OFFSET_MS);

const timeFmt = {
  format: (d: Date) => {
    const w = wat(d);
    return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
  },
};

const keyFmt = {
  format: (d: Date) => {
    const w = wat(d);
    return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
  },
};

/** Takes a Date at UTC midnight of a campus calendar day. */
const shortDayFmt = {
  format: (d: Date) => `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`,
};

const longDayFmt = {
  format: (d: Date) =>
    `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
};

/** "16:00" in campus time. */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** Calendar date key in campus time: "2026-09-28". */
export function dateKey(isoOrMs: string | number): string {
  return keyFmt.format(new Date(isoOrMs));
}

function keyToUTCDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function dayDiff(fromKey: string, toKey: string): number {
  return Math.round(
    (keyToUTCDate(toKey).getTime() - keyToUTCDate(fromKey).getTime()) / 86_400_000,
  );
}

/** "Today", "Tomorrow", "Yesterday" or "Sat 4 Oct". */
export function formatDayLabel(key: string, now: number): string {
  const diff = dayDiff(dateKey(now), key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return shortDayFmt.format(keyToUTCDate(key));
}

/** "Sat 4 Oct" — never relative. */
export function formatShortDate(iso: string): string {
  return shortDayFmt.format(keyToUTCDate(dateKey(iso)));
}

/** "Saturday 4 October 2026" */
export function formatLongDate(iso: string): string {
  return longDayFmt.format(keyToUTCDate(dateKey(iso)));
}

/** "Today, 16:00" / "Sat 4 Oct, 16:00" */
export function formatKickoff(iso: string, now: number): string {
  return `${formatDayLabel(dateKey(iso), now)}, ${formatTime(iso)}`;
}
