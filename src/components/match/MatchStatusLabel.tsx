import { formatTime } from "@/lib/format";
import { isClockRunning, isDisrupted, statusLongLabel, statusShortLabel } from "@/lib/status";
import type { Match } from "@/lib/types";
import { LiveMinute } from "./LiveMinute";

export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex size-2 shrink-0 ${className}`} aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-live-pulse" />
      <span className="relative size-2 rounded-full bg-live" />
    </span>
  );
}

/**
 * Compact status for list rows: kick-off time, running minute, or a status
 * code (HT / FT / PST / CAN / ABD). Includes screen-reader text.
 */
export function MatchStatusLabel({
  match,
  serverNow,
}: {
  match: Pick<Match, "status" | "kickoffAt" | "periodStartedAt" | "clock">;
  serverNow: number;
}) {
  const { status } = match;

  if (isClockRunning(status)) {
    return (
      <span className="font-bold text-live">
        <span className="sr-only">Live, </span>
        <LiveMinute status={status} periodStartedAt={match.periodStartedAt} clock={match.clock} serverNow={serverNow} />
      </span>
    );
  }

  const code = statusShortLabel(status);
  if (status === "HALF_TIME") {
    return (
      <span className="font-bold text-live" title="Half-time">
        <span aria-hidden="true">{code}</span>
        <span className="sr-only">Half-time</span>
      </span>
    );
  }
  if (status === "FULL_TIME") {
    return (
      <span className="font-semibold text-ink-faint" title="Full-time">
        <span aria-hidden="true">{code}</span>
        <span className="sr-only">Full-time</span>
      </span>
    );
  }
  if (isDisrupted(status)) {
    return (
      <span className="font-bold text-warn" title={statusLongLabel(status)}>
        <span aria-hidden="true">{code}</span>
        <span className="sr-only">{statusLongLabel(status)}</span>
      </span>
    );
  }
  return (
    <time dateTime={match.kickoffAt} className="font-semibold text-ink tabular-nums">
      {formatTime(match.kickoffAt)}
    </time>
  );
}
