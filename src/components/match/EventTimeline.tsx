import type { ReactNode } from "react";
import {
  BallIcon,
  CardIcon,
  GloveIcon,
  MedicalIcon,
  PenaltySpotIcon,
  SecondYellowIcon,
  SwapIcon,
  WhistleIcon,
} from "@/components/ui/icons";
import { buildTimeline, eventMinute, halfTimeScore, playerLabel, type TimelineEntry } from "@/lib/events";
import { isFinished, statusLongLabel } from "@/lib/status";
import type { MatchDetail, MatchEventType, Score, Team } from "@/lib/types";

const EVENT_TEXT: Record<MatchEventType, string> = {
  GOAL: "Goal",
  OWN_GOAL: "Own goal",
  PENALTY_GOAL: "Penalty scored",
  PENALTY_MISS: "Penalty missed",
  PENALTY_AWARDED: "Penalty awarded",
  PENALTY_SAVED: "Penalty saved",
  YELLOW_CARD: "Yellow card",
  SECOND_YELLOW: "Second yellow card",
  RED_CARD: "Red card",
  SUBSTITUTION: "Substitution",
  INJURY: "Injury",
  SUSPENSION_RETURN: "Returned",
  EXCLUSION: "Excluded from the match",
};

/** Under special rules a red card is a temporary suspension. */
function eventText(type: MatchEventType, match: MatchDetail): string {
  const secs = match.clock?.rules?.redCardSuspensionSeconds;
  if (secs && (type === "RED_CARD" || type === "SECOND_YELLOW")) return `${EVENT_TEXT[type]} (${secs} s)`;
  return EVENT_TEXT[type];
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
    case "PENALTY_AWARDED":
      return <PenaltySpotIcon size={18} className="text-brand-fg" />;
    case "PENALTY_SAVED":
      return <GloveIcon size={18} className="text-ink-muted" />;
    case "YELLOW_CARD":
      return <CardIcon size={18} color="yellow" />;
    case "SECOND_YELLOW":
      return <SecondYellowIcon size={18} />;
    case "RED_CARD":
    case "EXCLUSION":
      return <CardIcon size={18} color="red" />;
    case "SUBSTITUTION":
      return <SwapIcon size={17} className="text-ink-muted" />;
    case "INJURY":
      return <MedicalIcon size={18} className="text-loss" />;
    case "SUSPENSION_RETURN":
      return <span className="text-base font-black text-win">↩</span>;
  }
}

const isGoal = (t: MatchEventType) => t === "GOAL" || t === "PENALTY_GOAL" || t === "OWN_GOAL";

function Marker({ label, score, icon = true }: { label: string; score?: Score; icon?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5" role="presentation">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-xs font-bold tracking-wide text-ink-muted">
        {icon && <WhistleIcon size={13} />}
        {label}
        {score && (
          <span className="ml-0.5 tabular-nums text-ink">
            {score.home}–{score.away}
          </span>
        )}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </li>
  );
}

/** One line of commentary: what happened, who, and for which team. */
function describe(entry: TimelineEntry, match: MatchDetail, team: Team): { title: string; detail: ReactNode; sr: string } {
  const { event } = entry;
  const who = event.player.name || event.player.shirtNumber != null ? playerLabel(event.player) : null;
  const title = eventText(event.type, match);
  switch (event.type) {
    case "PENALTY_AWARDED":
      return { title, detail: <>to {team.name}</>, sr: `Penalty awarded to ${team.name}` };
    case "SUBSTITUTION": {
      const off = playerLabel(event.player);
      const on = event.playerIn ? playerLabel(event.playerIn) : "—";
      return {
        title: `${title} · ${team.shortName}`,
        detail: (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="truncate">
              <span className="font-bold text-loss">OUT</span> {off}
            </span>
            <span aria-hidden="true" className="text-ink-faint">
              →
            </span>
            <span className="truncate">
              <span className="font-bold text-win">IN</span> {on}
            </span>
          </span>
        ),
        sr: `Substitution, ${team.name}: ${off} off, ${on} on`,
      };
    }
    case "INJURY":
      return {
        title,
        detail: <>{who ? `${who} (${team.shortName})` : team.name} · play stopped</>,
        sr: `Injury, ${who ? `${who}, ` : ""}${team.name}, play stopped`,
      };
    case "OWN_GOAL":
      return { title, detail: <>{who ?? "Player not recorded"} ({team.shortName})</>, sr: `Own goal, ${who ?? ""} ${team.name}` };
    default:
      return {
        title,
        detail: <>{who ? `${who} (${team.shortName})` : team.name}</>,
        sr: `${title}, ${who ? `${who}, ` : ""}${team.name}`,
      };
  }
}

/**
 * Match commentary: every recorded event in order, each with its minute, what
 * happened, the player and the team. Kick-off, half-time, second-half and
 * full-time markers are derived from the match status. Voided (corrected)
 * events never reach this list.
 */
export function EventTimeline({ match }: { match: MatchDetail }) {
  const entries = buildTimeline(match);
  // Halves: by the event's period when known, else by the match's half length (45' normally).
  const halfMinute = Math.ceil((match.clock?.halfSeconds ?? 45 * 60) / 60);
  const inFirstHalf = (e: TimelineEntry) => (e.event.period ? e.event.period === 1 : e.event.minute <= halfMinute);
  const first = entries.filter(inFirstHalf);
  const second = entries.filter((e) => !inFirstHalf(e));
  const reachedHalfTime =
    match.status !== "LIVE_FIRST_HALF" && !(match.status === "ABANDONED" && (match.abandonedMinute ?? 0) <= halfMinute);
  const secondHalfStarted = reachedHalfTime && match.status !== "HALF_TIME";

  const row = (entry: TimelineEntry) => {
    const { event } = entry;
    const team = event.teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
    const { title, detail, sr } = describe(entry, match, team);
    const goal = isGoal(event.type);
    return (
      <li key={event.id} className={`relative flex items-start gap-3 rounded-xl px-2 py-2.5 ${goal ? "bg-win/8" : ""}`}>
        <span className="sr-only">
          {eventMinute(event)}: {sr}
          {entry.scoreAfter ? `. Score ${entry.scoreAfter.home}–${entry.scoreAfter.away}` : ""}.
        </span>
        <span
          aria-hidden="true"
          className="mt-0.5 w-11 shrink-0 text-right font-display text-[15px] leading-6 font-bold text-ink-muted tabular-nums"
        >
          {eventMinute(event)}
        </span>
        <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface">
          <EventIcon type={event.type} />
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface" style={{ background: team.colors.primary }} />
        </span>
        <span aria-hidden="true" className="min-w-0 flex-1">
          <span className={`block text-sm leading-6 ${goal ? "font-extrabold text-ink" : "font-bold text-ink"}`}>{title}</span>
          <span className="block min-w-0 text-[13px] leading-snug text-ink-muted">{detail}</span>
        </span>
        {entry.scoreAfter && (
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 rounded-md bg-ink px-1.5 py-0.5 font-display text-sm font-bold text-surface tabular-nums"
          >
            {entry.scoreAfter.home}–{entry.scoreAfter.away}
          </span>
        )}
      </li>
    );
  };

  const score = match.score ?? { home: 0, away: 0 };

  return (
    <ol aria-label="Match commentary" className="rounded-card border border-line bg-surface px-1.5 py-1.5 sm:px-3">
      <Marker label="Kick-off" />
      {first.map(row)}
      {reachedHalfTime && <Marker label="Half-time" score={halfTimeScore(match)} />}
      {secondHalfStarted && <Marker label="Second half" />}
      {second.map(row)}
      {isFinished(match.status) && <Marker label="Full-time" score={score} />}
      {match.status === "ABANDONED" && (
        <Marker label={`${statusLongLabel(match.status)}${match.abandonedMinute ? ` ${match.abandonedMinute}'` : ""}`} score={score} />
      )}
    </ol>
  );
}
