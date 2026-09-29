import Link from "next/link";
import type { LiveMatch } from "@/lib/admin/types";
import { formatWatDateTime } from "@/lib/admin/time";
import { formatTime } from "@/lib/format";
import { clockLabel } from "@/lib/admin/clock";
import { LiveClock } from "./LiveClock";
import { StatusBadge } from "./ui";

const EVENT_LABEL: Record<string, string> = {
  GOAL: "Goal",
  PENALTY_GOAL: "Penalty goal",
  OWN_GOAL: "Own goal",
  PENALTY_MISS: "Penalty missed",
  YELLOW_CARD: "Yellow card",
  SECOND_YELLOW: "Second yellow",
  RED_CARD: "Red card",
  SUBSTITUTION: "Substitution",
};
export const eventLabel = (t: string) => EVENT_LABEL[t] ?? t;

function ago(iso: string | null, now: number): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return formatWatDateTime(iso);
}

export function LiveMatchCard({ m, now }: { m: LiveMatch; now: number }) {
  const s = m.match;
  const stale = m.last_activity_at ? now - Date.parse(m.last_activity_at) > 10 * 60_000 : true;
  return (
    <Link
      href={`/admin/matches/${s.id}`}
      className="block min-w-0 rounded-card border border-line bg-surface p-4 hover:border-brand-300 focus-visible:border-brand-500"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="truncate text-xs font-bold tracking-wide text-ink-muted uppercase">
          {m.competition}
          {m.round_label ? ` · ${m.round_label}` : ""}
        </span>
        <StatusBadge status={s.status} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="truncate text-right font-bold">{m.home}</span>
        <span className="rounded-md bg-ink px-2.5 py-1 font-display text-2xl leading-none font-extrabold text-white tabular-nums">
          {s.home_score}–{s.away_score}
        </span>
        <span className="truncate font-bold">{m.away}</span>
      </div>
      <p className="mt-2 text-center text-sm font-bold text-live">
        <LiveClock match={s} serverNow={now} initial={clockLabel(s, now)} />
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-muted">Venue</dt>
        <dd className="truncate text-right font-semibold">{m.venue ?? "—"}</dd>
        <dt className="text-ink-muted">In control</dt>
        <dd className={`truncate text-right font-semibold ${m.operator ? "" : "text-loss"}`}>{m.operator ?? "Nobody"}</dd>
        <dt className="text-ink-muted">Last event</dt>
        <dd className="truncate text-right font-semibold">
          {m.last_event ? `${eventLabel(m.last_event.type)} ${m.last_event.minute}'${m.last_event.voided ? " (voided)" : ""}` : "None yet"}
        </dd>
        <dt className="text-ink-muted">Last activity</dt>
        <dd className={`truncate text-right font-semibold ${stale ? "text-warn" : ""}`}>
          {ago(m.last_activity_at, now)}
          {stale ? " ⚠" : ""}
        </dd>
        <dt className="text-ink-muted">Kick-off</dt>
        <dd className="text-right font-semibold">{formatTime(m.scheduled_at)} WAT</dd>
      </dl>
    </Link>
  );
}
