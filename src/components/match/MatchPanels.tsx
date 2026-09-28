import type { ReactNode } from "react";
import { FormGuide } from "@/components/team/FormGuide";
import { TeamCrest } from "@/components/team/TeamCrest";
import { AlertIcon, ChartIcon, ShirtIcon, WhistleIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatLongDate, formatTime } from "@/lib/format";
import { isDisrupted, statusLongLabel } from "@/lib/status";
import type { FormResult, MatchDetail, MatchSummary, StandingRow, Team } from "@/lib/types";
import { MatchCardList } from "./MatchList";
import { EventTimeline } from "./EventTimeline";

export function DisruptionNotice({ match }: { match: MatchDetail }) {
  if (!isDisrupted(match.status)) return null;
  return (
    <div role="note" className="flex gap-3 rounded-card border border-accent-300 bg-warn-soft px-3.5 py-3">
      <AlertIcon size={20} className="mt-0.5 shrink-0 text-warn" />
      <div className="text-sm">
        <p className="font-bold text-ink">Match {statusLongLabel(match.status).toLowerCase()}</p>
        {match.statusNote && <p className="mt-0.5 text-ink-muted">{match.statusNote}</p>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface">
      <h3 className="border-b border-line px-4 py-2.5 text-xs font-bold tracking-wide text-ink-muted uppercase">{title}</h3>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function MatchInfo({ match }: { match: MatchDetail }) {
  const rows: [string, string][] = [
    ["Competition", match.competition.name],
    ["Round", match.round],
    ["Kick-off", `${formatLongDate(match.kickoffAt)}, ${formatTime(match.kickoffAt)} WAT`],
    ["Venue", match.venue.name],
    ["Status", statusLongLabel(match.status)],
  ];
  return (
    <Card title="Match info">
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-ink-faint">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export interface PreMatchTeam {
  team: Team;
  form: FormResult[];
  standing?: StandingRow;
}

export function PreMatch({ home, away }: { home: PreMatchTeam; away: PreMatchTeam }) {
  const hasTable = home.standing || away.standing;
  return (
    <Card title="Form guide">
      <ul className="space-y-3">
        {[home, away].map(({ team, form, standing }) => (
          <li key={team.id} className="flex items-center gap-3">
            <TeamCrest team={team} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{team.name}</span>
              {hasTable && (
                <span className="block text-xs text-ink-faint">
                  {standing ? `${ordinal(standing.position)} · ${standing.points} pts` : "—"}
                </span>
              )}
            </span>
            <FormGuide form={form} size="sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function SummaryPanel({
  match,
  preMatch,
}: {
  match: MatchDetail;
  preMatch: { home: PreMatchTeam; away: PreMatchTeam };
}) {
  const started = match.score !== null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <DisruptionNotice match={match} />
        {started ? (
          match.events.length > 0 ? (
            <EventTimeline match={match} />
          ) : (
            <EmptyState compact icon={<WhistleIcon size={22} />} title="No key events yet" description="Goals, cards and substitutions will be listed here." />
          )
        ) : (
          <>
            {!isDisrupted(match.status) && (
              <EmptyState
                compact
                icon={<WhistleIcon size={22} />}
                title="Match not started"
                description={`Kick-off at ${formatTime(match.kickoffAt)} WAT. Key events will appear here once play begins.`}
              />
            )}
            <PreMatch {...preMatch} />
          </>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        {started && <PreMatch {...preMatch} />}
        <MatchInfo match={match} />
      </div>
    </div>
  );
}

export function NotAvailablePanel({ kind }: { kind: "lineups" | "stats" }) {
  return kind === "lineups" ? (
    <EmptyState
      icon={<ShirtIcon size={22} />}
      title="Line-ups not available yet"
      description="Team sheets will be published here once match officials start recording them."
    />
  ) : (
    <EmptyState
      icon={<ChartIcon size={22} />}
      title="Match stats not available yet"
      description="Detailed statistics like shots and possession aren't recorded for this competition yet."
    />
  );
}

export function HeadToHeadPanel({
  match,
  meetings,
  serverNow,
}: {
  match: MatchDetail;
  meetings: MatchSummary[];
  serverNow: number;
}) {
  if (meetings.length === 0) {
    return (
      <EmptyState
        title="No previous meetings"
        description={`${match.homeTeam.shortName} and ${match.awayTeam.shortName} haven't met in a recorded competitive match yet.`}
      />
    );
  }
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (const m of meetings) {
    if (!m.score) continue;
    const homeGoals = m.homeTeamId === match.homeTeamId ? m.score.home : m.score.away;
    const awayGoals = m.homeTeamId === match.homeTeamId ? m.score.away : m.score.home;
    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals < awayGoals) awayWins++;
    else draws++;
  }
  const stats: [string, number, Team | null][] = [
    [match.homeTeam.shortName, homeWins, match.homeTeam],
    ["Draws", draws, null],
    [match.awayTeam.shortName, awayWins, match.awayTeam],
  ];
  return (
    <div className="space-y-4">
      <section aria-label="Head-to-head record" className="grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface py-3 text-center">
        {stats.map(([label, n, team]) => (
          <div key={label} className="flex min-w-0 flex-col items-center gap-1 px-2">
            {team ? <TeamCrest team={team} size="sm" /> : <span className="h-[26px]" />}
            <span className="font-display text-2xl font-bold tabular-nums">{n}</span>
            <span className="max-w-full truncate text-xs text-ink-faint">{team ? `${label} wins` : label}</span>
          </div>
        ))}
      </section>
      <h3 className="px-1 text-xs font-bold tracking-wide text-ink-muted uppercase">Previous meetings</h3>
      <MatchCardList matches={meetings} serverNow={serverNow} />
    </div>
  );
}
