/**
 * Date/time formatting. All match times are shown in campus time (WAT) no
 * matter where the viewer's device is, so server and client render the same.
 */
export const CAMPUS_TIME_ZONE = "Africa/Lagos";

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const keyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const shortDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const longDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

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
