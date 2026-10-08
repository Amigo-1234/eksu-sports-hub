import { Pitch } from "@/components/lineup/Pitch";
import { TeamCrest } from "@/components/team/TeamCrest";
import { BallIcon, CardIcon, ShirtIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { currentPitch, startingPitch } from "@/lib/lineup";
import type { MatchDetail, PublicClock, PublicLineup, PublicLineupPlayer, Team } from "@/lib/types";
import { SuspensionBadge } from "./RulesClock";
import { DemoDataNote } from "./MatchPanels";

const min = (m: number | null, extra: number | null) => (m === null ? "" : extra ? `${m}+${extra}'` : `${m}'`);

function PlayerRow({ p, clock }: { p: PublicLineupPlayer; clock?: PublicClock | null }) {
  return (
    <li className="flex min-h-10 items-center gap-2.5 px-3 py-1.5 text-sm">
      <span className="w-6 shrink-0 text-right font-display text-base font-bold tabular-nums text-ink-muted">{p.shirtNumber}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {p.name ?? `No. ${p.shirtNumber}`}
        {p.captain && (
          <span className="ml-1.5 rounded bg-ink px-1 text-[10px] font-black text-white" title="Captain">
            C<span className="sr-only">aptain</span>
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-faint">
        {p.goalkeeper && <span className="font-bold">GK</span>}
        {!p.goalkeeper && p.position && <span>{p.position}</span>}
        {p.goals > 0 && (
          <span className="inline-flex items-center gap-0.5 text-ink">
            <BallIcon size={14} />
            {p.goals > 1 && <span aria-hidden="true">×{p.goals}</span>}
            <span className="sr-only">
              {p.goals} goal{p.goals > 1 ? "s" : ""}
            </span>
          </span>
        )}
        {p.booked && !p.sentOff && (
          <span>
            <CardIcon size={14} color="yellow" />
            <span className="sr-only">Booked</span>
          </span>
        )}
        {p.sentOff && (
          <span>
            <CardIcon size={14} color="red" />
            <span className="sr-only">{p.excluded ? "Excluded" : "Sent off"}</span>
          </span>
        )}
        {!p.sentOff && (p.redCards ?? 0) > 0 && (
          <span>
            <CardIcon size={14} color="red" />
            {(p.redCards ?? 0) > 1 && <span aria-hidden="true">×{p.redCards}</span>}
            <span className="sr-only">{p.redCards} temporary red card{(p.redCards ?? 0) > 1 ? "s" : ""}</span>
          </span>
        )}
        {p.excluded && <span className="rounded bg-ink px-1.5 py-px text-[11px] font-bold text-white">Excluded</span>}
        {p.suspended && <SuspensionBadge clock={clock} endsActive={p.suspensionEndsActive} />}
        {(p.entries ?? 0) > 1 && (
          <span className="font-semibold text-win" title="Times this player came on (rolling substitutions)">
            ↑×{p.entries}<span className="sr-only"> entries</span>
          </span>
        )}
        {p.subbedOn && (
          <span className="font-semibold text-win">
            <span aria-hidden="true">↑</span>
            <span className="sr-only">Came on</span> {min(p.onMinute, p.onExtra)}
          </span>
        )}
        {p.subbedOff && (
          <span className="font-semibold text-loss">
            <span aria-hidden="true">↓</span>
            <span className="sr-only">Went off</span> {min(p.offMinute, p.offExtra)}
          </span>
        )}
      </span>
    </li>
  );
}

function TeamSheet({ team, lineup, match }: { team: Team; lineup: PublicLineup | undefined; match: MatchDetail }) {
  const heading = `${team.shortName} line-up`;
  if (!lineup) {
    return (
      <section aria-label={heading} className="min-w-0 space-y-3">
        <TeamHeader team={team} formation={null} />
        <EmptyState compact icon={<ShirtIcon size={22} />} title="Line-up not published yet" description="It appears here once the team sheet is confirmed." />
      </section>
    );
  }
  const started = match.score !== null;
  const events = [...match.events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const onPitch = started ? currentPitch(lineup, team.id, events, !!match.clock?.rules?.redCardSuspensionSeconds) : startingPitch(lineup);
  const starters = lineup.players.filter((p) => p.role === "STARTER");
  const subs = lineup.players.filter((p) => p.role === "SUBSTITUTE");
  const startLabel = starters.length === 11 ? "Starting XI" : starters.length === 6 ? "Starting six" : "Starting line-up";
  return (
    <section aria-label={heading} className="min-w-0 space-y-3">
      <TeamHeader team={team} formation={lineup.formation} />
      <div>
        <p className="mb-1.5 text-center text-xs font-bold tracking-wide text-ink-muted uppercase">{!started ? startLabel : match.status === "FULL_TIME" ? "On the pitch at full-time" : "On the pitch"}</p>
        <Pitch players={onPitch} colors={team.colors} label={`${team.name} ${started ? "players on the pitch" : "starting positions"}`} />
      </div>
      <div className="rounded-card border border-line bg-surface">
        <h3 className="border-b border-line px-3 py-2 text-xs font-bold tracking-wide text-ink-muted uppercase">{startLabel}</h3>
        <ol className="divide-y divide-line">
          {starters.map((p) => (
            <PlayerRow key={p.shirtNumber} p={p} clock={match.clock} />
          ))}
        </ol>
        <h3 className="border-y border-line px-3 py-2 text-xs font-bold tracking-wide text-ink-muted uppercase">Substitutes</h3>
        {subs.length === 0 ? (
          <p className="px-3 py-2 text-sm text-ink-faint">None named.</p>
        ) : (
          <ol className="divide-y divide-line">
            {subs.map((p) => (
              <PlayerRow key={p.shirtNumber} p={p} clock={match.clock} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function TeamHeader({ team, formation }: { team: Team; formation: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamCrest team={team} size="sm" />
      <h3 className="min-w-0 flex-1 truncate font-display text-lg font-bold uppercase">{team.name}</h3>
      {formation && <span className="shrink-0 rounded bg-subtle px-2 py-0.5 text-xs font-bold tabular-nums">{formation}</span>}
    </div>
  );
}

/** Published team sheets for both sides, with a responsive pitch. */
export function LineupsPanel({ match }: { match: MatchDetail }) {
  const lineups = match.lineups ?? [];
  if (lineups.length === 0) {
    return (
      <EmptyState
        icon={<ShirtIcon size={22} />}
        title="Line-ups not published yet"
        description="Team sheets appear here once each team's line-up is confirmed before kick-off."
      />
    );
  }
  return (
    <div className="space-y-4">
    {lineups.some((l) => l.demo) && (
      <DemoDataNote>Demo / test team sheets for this match — not official line-ups.</DemoDataNote>
    )}
    <div className="grid gap-6 lg:grid-cols-2">
      <TeamSheet team={match.homeTeam} match={match} lineup={lineups.find((l) => l.teamId === match.homeTeamId)} />
      <TeamSheet team={match.awayTeam} match={match} lineup={lineups.find((l) => l.teamId === match.awayTeamId)} />
    </div>
    </div>
  );
}
