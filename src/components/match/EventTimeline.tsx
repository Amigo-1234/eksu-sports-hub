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

/** Flashscore-style period band: "1st Half" on the left, that half's score on the right. */
function Band({ label, score }: { label: string; score?: Score }) {
  return (
    <li role="presentation" className="flex items-center justify-between bg-subtle px-3 py-1.5 text-[11px] font-extrabold tracking-wider text-ink-muted uppercase">
      <span>{label}</span>
      {score && (
        <span className="tabular-nums text-ink">
          {score.home} - {score.away}
        </span>
      )}
    </li>
  );
}

/** Main line (player) and sub line (what happened / who came off), plus a screen-reader sentence. */
function describe(entry: TimelineEntry, match: MatchDetail, team: Team): { main: ReactNode; sub: ReactNode; sr: string } {
  const { event } = entry;
  const who = event.player.name || event.player.shirtNumber != null ? playerLabel(event.player) : null;
  const title = eventText(event.type, match);
  switch (event.type) {
    case "PENALTY_AWARDED":
      return { main: title, sub: team.shortName, sr: `Penalty awarded to ${team.name}` };
    case "SUBSTITUTION": {
      const off = playerLabel(event.player);
      const on = event.playerIn ? playerLabel(event.playerIn) : "—";
      return {
        main: <span className="text-win">{on}</span>,
        sub: <span className="text-loss">{off}</span>,
        sr: `Substitution, ${team.name}: ${off} off, ${on} on`,
      };
    }
    case "INJURY":
      return { main: who ?? team.shortName, sub: "Injury · play stopped", sr: `Injury, ${who ? `${who}, ` : ""}${team.name}, play stopped` };
    case "OWN_GOAL":
      return { main: who ?? "Player not recorded", sub: "Own goal", sr: `Own goal, ${who ?? ""} ${team.name}` };
    case "GOAL":
      return { main: who ?? team.shortName, sub: null, sr: `${title}, ${who ? `${who}, ` : ""}${team.name}` };
    case "PENALTY_GOAL":
      return { main: who ?? team.shortName, sub: "Penalty", sr: `${title}, ${who ? `${who}, ` : ""}${team.name}` };
    default:
      return { main: who ?? team.shortName, sub: title, sr: `${title}, ${who ? `${who}, ` : ""}${team.name}` };
  }
}

const minus = (a: Score, b: Score): Score => ({ home: a.home - b.home, away: a.away - b.away });

/**
 * Match summary, Flashscore-style: a band per half with that half's score,
 * home events on the left and away events mirrored on the right. Kick-off,
 * half-time and full-time are derived from the match status. Voided
 * (corrected) events never reach this list.
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
  const score = match.score ?? { home: 0, away: 0 };
  const ht = halfTimeScore(match);

  const row = (entry: TimelineEntry) => {
    const { event } = entry;
    const team = event.teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
    const away = entry.side === "away";
    const { main, sub, sr } = describe(entry, match, team);
    const goal = isGoal(event.type);
    return (
      <li key={event.id} className={`px-3 py-2 ${goal ? "bg-win/6" : ""}`}>
        <span className="sr-only">
          {eventMinute(event)}: {sr}
          {entry.scoreAfter ? `. Score ${entry.scoreAfter.home}–${entry.scoreAfter.away}` : ""}.
        </span>
        <div aria-hidden="true" className={`flex items-center gap-2.5 ${away ? "flex-row-reverse text-right" : ""}`}>
          <span className="w-9 shrink-0 font-display text-[15px] font-bold text-ink-muted tabular-nums">{eventMinute(event)}</span>
          <span className="grid size-6 shrink-0 place-items-center">
            <EventIcon type={event.type} />
          </span>
          {entry.scoreAfter && (
            <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 font-display text-[13px] font-bold text-surface tabular-nums">
              {entry.scoreAfter.home} - {entry.scoreAfter.away}
            </span>
          )}
          <span className="min-w-0 max-w-[62%] leading-tight">
            <span className={`block truncate text-sm ${goal ? "font-extrabold" : "font-bold"} text-ink`}>{main}</span>
            {sub && <span className="block truncate text-xs text-ink-faint">{sub}</span>}
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-bold text-ink-muted">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="size-2 shrink-0 rounded-full" style={{ background: match.homeTeam.colors.primary }} aria-hidden="true" />
          {match.homeTeam.shortName}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {match.awayTeam.shortName}
          <span className="size-2 shrink-0 rounded-full" style={{ background: match.awayTeam.colors.primary }} aria-hidden="true" />
        </span>
      </div>
      <ol aria-label="Match summary" className="divide-y divide-line/60">
        <Band label="1st Half" score={reachedHalfTime ? ht : score} />
        {first.length === 0 && <Empty />}
        {first.map(row)}
        {secondHalfStarted && (
          <>
            <Band label="2nd Half" score={minus(score, ht)} />
            {second.length === 0 && <Empty />}
            {second.map(row)}
          </>
        )}
        {match.status === "HALF_TIME" && <Status icon label="Half-time" score={score} />}
        {isFinished(match.status) && <Status icon label="Full-time" score={score} />}
        {match.status === "ABANDONED" && (
          <Status label={`${statusLongLabel(match.status)}${match.abandonedMinute ? ` ${match.abandonedMinute}'` : ""}`} score={score} />
        )}
      </ol>
    </div>
  );
}

function Empty() {
  return (
    <li role="presentation" className="px-3 py-2.5 text-center text-xs text-ink-faint">
      No events
    </li>
  );
}

function Status({ label, score, icon = false }: { label: string; score: Score; icon?: boolean }) {
  return (
    <li className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold tracking-wide text-ink-muted uppercase">
      {icon && <WhistleIcon size={13} />}
      {label}
      <span className="tabular-nums text-ink">
        {score.home} - {score.away}
      </span>
    </li>
  );
}
