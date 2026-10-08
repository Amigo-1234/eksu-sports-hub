import { BallIcon, CardIcon, SwapIcon } from "@/components/ui/icons";
import { buildTimeline, eventMinute, halfTimeScore, playerLabel, type TimelineEntry } from "@/lib/events";
import { isFinished, statusLongLabel } from "@/lib/status";
import type { MatchDetail, MatchEventType, Score } from "@/lib/types";

const EVENT_TEXT: Record<MatchEventType, string> = {
  GOAL: "Goal",
  OWN_GOAL: "Own goal",
  PENALTY_GOAL: "Penalty goal",
  PENALTY_MISS: "Penalty missed",
  YELLOW_CARD: "Yellow card",
  RED_CARD: "Red card",
  SUBSTITUTION: "Substitution",
  SUSPENSION_RETURN: "Returned",
  EXCLUSION: "Excluded from the match",
};

/** Under special rules a red card is a temporary suspension. */
function eventText(type: MatchEventType, match: MatchDetail): string {
  const secs = match.clock?.rules?.redCardSuspensionSeconds;
  return type === "RED_CARD" && secs ? `Red card (${secs} s)` : EVENT_TEXT[type];
}

function EventIcon({ type }: { type: MatchEventType }) {
  switch (type) {
    case "GOAL":
    case "PENALTY_GOAL":
      return <BallIcon size={18} className="text-ink" />;
    case "OWN_GOAL":
      return <BallIcon size={18} className="text-loss" />;
    case "PENALTY_MISS":
      return (
        <span className="relative inline-grid">
          <BallIcon size={18} className="text-ink-faint" />
          <span className="absolute top-1/2 left-1/2 h-[2px] w-5 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded bg-loss" />
        </span>
      );
    case "YELLOW_CARD":
      return <CardIcon size={18} color="yellow" />;
    case "RED_CARD":
      return <CardIcon size={18} color="red" />;
    case "SUBSTITUTION":
      return <SwapIcon size={17} className="text-ink-muted" />;
    case "SUSPENSION_RETURN":
      return <span className="text-base font-black text-win">↩</span>;
    case "EXCLUSION":
      return <CardIcon size={18} color="red" />;
  }
}

function Divider({ label, score }: { label: string; score?: Score }) {
  return (
    <li className="flex items-center gap-3 py-2" role="presentation">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="rounded-full bg-subtle px-3 py-1 text-xs font-bold tracking-wide text-ink-muted">
        {label}
        {score && (
          <span className="ml-1.5 tabular-nums text-ink">
            {score.home}–{score.away}
          </span>
        )}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </li>
  );
}

function EventBody({ entry, match }: { entry: TimelineEntry; match: MatchDetail }) {
  const alignEnd = entry.side === "home";
  const { event } = entry;
  const team = event.teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
  const strong = event.type === "GOAL" || event.type === "PENALTY_GOAL" || event.type === "OWN_GOAL";

  if (event.type === "SUBSTITUTION" && event.playerIn) {
    return (
      <div className="min-w-0 text-sm leading-tight">
        <p className="truncate font-semibold text-win">
          <span className="sr-only">On: </span>
          <span aria-hidden="true">↑ </span>
          {playerLabel(event.playerIn)}
        </p>
        <p className="truncate text-xs text-ink-faint">
          <span className="sr-only">Off: </span>
          <span aria-hidden="true">↓ </span>
          {playerLabel(event.player)}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 text-sm leading-tight">
      <p className={`truncate ${strong ? "font-bold text-ink" : "font-semibold text-ink"}`}>{playerLabel(event.player)}</p>
      <p className={`flex min-w-0 items-center gap-1.5 text-xs text-ink-faint ${alignEnd ? "justify-end" : ""}`}>
        <span className="truncate">
          {eventText(event.type, match)}
          {event.type === "OWN_GOAL" && ` · ${team.shortName}`}
        </span>
        {entry.scoreAfter && (
          <span className="shrink-0 rounded bg-ink px-1 py-px text-[11px] font-bold text-white tabular-nums">
            {entry.scoreAfter.home}–{entry.scoreAfter.away}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Chronological event feed. Home events sit left of the minute column, away
 * events right — on every width. Kick-off, half-time and full-time markers
 * are derived from the match status.
 */
export function EventTimeline({ match }: { match: MatchDetail }) {
  const entries = buildTimeline(match);
  // Halves: by the event's period when known, else by the match's half length (45' normally).
  const halfMinute = Math.ceil((match.clock?.halfSeconds ?? 45 * 60) / 60);
  const inFirstHalf = (e: TimelineEntry) => (e.event.period ? e.event.period === 1 : e.event.minute <= halfMinute);
  const first = entries.filter(inFirstHalf);
  const second = entries.filter((e) => !inFirstHalf(e));
  const reachedHalfTime =
    match.status !== "LIVE_FIRST_HALF" &&
    !(match.status === "ABANDONED" && (match.abandonedMinute ?? 0) <= halfMinute);

  const row = (entry: TimelineEntry) => {
    const { event, side } = entry;
    const team = event.teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
    const content = (
      <div className={`flex min-w-0 items-center gap-2 ${side === "home" ? "flex-row-reverse text-right" : ""}`}>
        <span className="grid size-7 shrink-0 place-items-center" aria-hidden="true">
          <EventIcon type={event.type} />
        </span>
        <EventBody entry={entry} match={match} />
      </div>
    );
    return (
      <li key={event.id} className="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center py-1.5">
        <span className="sr-only">
          {eventMinute(event)}, {eventText(event.type, match)}, {team.name}.
        </span>
        <div className="min-w-0">{side === "home" && content}</div>
        <div className="flex justify-center" aria-hidden="true">
          <span className="min-w-10 rounded-full border border-line bg-surface px-1.5 py-0.5 text-center text-xs font-bold text-ink-muted tabular-nums">
            {eventMinute(event)}
          </span>
        </div>
        <div className="min-w-0">{side === "away" && content}</div>
      </li>
    );
  };

  const score = match.score ?? { home: 0, away: 0 };

  return (
    <ol aria-label="Match events" className="rounded-card border border-line bg-surface px-2 py-2 sm:px-4">
      <Divider label="Kick-off" />
      {first.map(row)}
      {reachedHalfTime && <Divider label="HT" score={halfTimeScore(match)} />}
      {second.map(row)}
      {isFinished(match.status) && <Divider label="FT" score={score} />}
      {match.status === "ABANDONED" && (
        <Divider label={`${statusLongLabel(match.status)}${match.abandonedMinute ? ` ${match.abandonedMinute}'` : ""}`} score={score} />
      )}
    </ol>
  );
}
