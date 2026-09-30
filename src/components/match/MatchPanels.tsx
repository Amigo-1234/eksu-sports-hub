import type { ReactNode } from "react";
import { FormGuide } from "@/components/team/FormGuide";
import { TeamCrest } from "@/components/team/TeamCrest";
import { AlertIcon, ChartIcon, ShirtIcon, WhistleIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatLongDate, formatTime } from "@/lib/format";
import { isDisrupted, statusLongLabel } from "@/lib/status";
import type { FormResult, MatchDetail, MatchSummary, StandingRow, Team, TeamMatchStats } from "@/lib/types";
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
        title="No previous meetings recorded"
        description={`This is the first recorded meeting between ${match.homeTeam.name} and ${match.awayTeam.name}.`}
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

/** Compact, honest label for demonstration data (DEMO SHOWCASE matches). */
export function DemoDataNote({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-accent-300 bg-warn-soft px-3 py-2 text-xs text-ink-muted">
      <span className="shrink-0 rounded bg-accent-400 px-1.5 py-px text-[10px] font-black tracking-wider text-brand-900 uppercase">Demo</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const STAT_ROWS: [label: string, key: keyof TeamMatchStats, suffix: string][] = [
  ["Possession", "possession", "%"],
  ["Shots", "shots", ""],
  ["Shots on target", "shotsOnTarget", ""],
  ["Corners", "corners", ""],
  ["Fouls", "fouls", ""],
  ["Yellow cards", "yellowCards", ""],
  ["Red cards", "redCards", ""],
];

/** Side-by-side match statistics with proportional bars. */
export function StatsPanel({ match }: { match: MatchDetail }) {
  const stats = match.stats;
  if (!stats) return <NotAvailablePanel kind="stats" />;
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {stats.demo && <DemoDataNote>{stats.note || "Demonstration statistics — not officially collected."}</DemoDataNote>}
      <section aria-label="Match statistics" className="rounded-card border border-line bg-surface">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-line px-4 py-3">
          <span className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
            <TeamCrest team={match.homeTeam} size="sm" />
            <span className="text-xs leading-tight font-bold sm:text-sm">{match.homeTeam.shortName}</span>
          </span>
          <h3 className="text-xs font-bold tracking-wide text-ink-muted uppercase">Match stats</h3>
          <span className="flex min-w-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-2">
            <TeamCrest team={match.awayTeam} size="sm" />
            <span className="text-right text-xs leading-tight font-bold sm:text-sm">{match.awayTeam.shortName}</span>
          </span>
        </div>
        <dl className="divide-y divide-line px-4">
          {STAT_ROWS.map(([label, key, suffix]) => {
            const h = stats.home[key];
            const a = stats.away[key];
            const max = Math.max(h, a, 1);
            return (
              <div key={key} className="py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={`w-12 font-display text-lg font-bold tabular-nums ${h > a ? "text-ink" : "text-ink-muted"}`}>
                    {h}
                    {suffix}
                  </span>
                  <dt className="min-w-0 text-center text-xs font-semibold text-ink-muted">{label}</dt>
                  <span className={`w-12 text-right font-display text-lg font-bold tabular-nums ${a > h ? "text-ink" : "text-ink-muted"}`}>
                    {a}
                    {suffix}
                  </span>
                </div>
                <dd className="mt-1.5 flex h-1.5 gap-1" aria-label={`${match.homeTeam.name} ${h}${suffix}, ${match.awayTeam.name} ${a}${suffix}`}>
                  <span className="flex flex-1 justify-end overflow-hidden rounded-full bg-subtle">
                    <span className="h-full rounded-full bg-brand-700" style={{ width: `${(h / max) * 100}%` }} />
                  </span>
                  <span className="flex flex-1 overflow-hidden rounded-full bg-subtle">
                    <span className="h-full rounded-full bg-accent-400" style={{ width: `${(a / max) * 100}%` }} />
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
