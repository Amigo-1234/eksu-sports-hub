import { clockFromCanonical, type CanonicalMatch } from "@/lib/operator/canonical";
import { displayClock } from "@/lib/operator/clock";

/** The clock fields of a canonical match snapshot. */
export type ClockSnap = Pick<
  CanonicalMatch,
  "status" | "current_period" | "period_started_at" | "period_ended_at" | "period_offset_seconds" | "clock_running" | "paused_at" | "accumulated_pause_seconds" | "stoppage_seconds" | "half_seconds" | "et_half_seconds"
>;

/** Match minute label from server timestamps (same maths as the operator console). Pure. */
export function clockLabel(m: ClockSnap, now: number): string {
  if (m.status === "HT") return "HT";
  if (m.status === "FT") return "FT";
  if (m.status !== "1H" && m.status !== "2H") return "—";
  const d = displayClock(clockFromCanonical({ ...m, period_ended_at: m.period_ended_at ?? null } as CanonicalMatch), now);
  return d.paused ? `${d.label} · paused` : d.label;
}
