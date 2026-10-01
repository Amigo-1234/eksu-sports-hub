import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveMatchCard } from "@/components/match/LiveMatchCard";
import { MatchCardList } from "@/components/match/MatchList";
import { TeamFollowButton } from "@/components/notifications/TeamFollowButton";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { FormGuide } from "@/components/team/FormGuide";
import { TeamCrest } from "@/components/team/TeamCrest";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCompetitions, getMatches, getNow, getStandings, getTeam } from "@/lib/data";
import { outcomeFor } from "@/lib/match";

export async function generateMetadata({ params }: PageProps<"/teams/[id]">): Promise<Metadata> {
  const t = await getTeam((await params).id);
  return { title: t?.name ?? "Team" };
}

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) notFound();

  const now = await getNow();
  const [competitions, live, upcoming, results] = await Promise.all([
    getCompetitions(),
    getMatches({ scope: "live", teamId: id }),
    getMatches({ scope: "upcoming", teamId: id }),
    getMatches({ scope: "results", teamId: id }),
  ]);
  const teamCompetitions = competitions.filter((c) => c.teamIds.includes(id));
  const league = teamCompetitions.find((c) => c.format === "league");
  const standings = league ? await getStandings(league.id) : [];
  const row = standings.find((s) => s.teamId === id);

  const next = upcoming.find((m) => m.status === "SCHEDULED");
  const completed = results.filter((m) => m.status === "FULL_TIME");
  const form = completed
    .slice(0, 5)
    .reverse()
    .map((m) => ({ matchId: m.id, outcome: outcomeFor(m, id)! }));

  // A table window around the team: two places either side.
  const idx = standings.findIndex((s) => s.teamId === id);
  const start = Math.max(0, Math.min(idx - 2, standings.length - 5));
  const window = idx >= 0 ? standings.slice(start, start + 5) : [];

  return (
    <div className="pt-2 sm:pt-4">
      <BackLink />
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
        <TeamCrest team={team} size="xl" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">{team.name}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {team.kind === "faculty" ? "Faculty side" : "Departmental side"} ·{" "}
            {team.category === "women" ? "Women" : "Men"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {teamCompetitions.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/competitions/${c.id}`}
                  className="inline-flex h-7 items-center rounded-full bg-subtle px-2.5 text-xs font-semibold text-ink-muted hover:text-brand-700"
                >
                  {c.shortName}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 empty:hidden">
            <TeamFollowButton teamId={team.id} teamName={team.name} />
          </div>
        </div>
      </section>

      <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface py-3 text-center">
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Position</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">{row ? row.position : "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Points</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">{row ? row.points : "—"}</dd>
        </div>
        <div className="flex flex-col items-center">
          <dt className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Form</dt>
          <dd className="mt-1.5">
            <FormGuide form={form} size="sm" />
          </dd>
        </div>
      </dl>

      <div className="mt-7 grid gap-x-6 gap-y-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-7">
          {live.length > 0 && (
            <section aria-labelledby="t-live">
              <SectionHeader id="t-live" title="Playing now" />
              {live.map((m) => (
                <LiveMatchCard key={m.id} match={m} serverNow={now} />
              ))}
            </section>
          )}
          <section aria-labelledby="t-next">
            <SectionHeader id="t-next" title="Next fixture" />
            {next ? (
              <MatchCardList matches={[next]} serverNow={now} />
            ) : (
              <EmptyState compact title="No upcoming fixture" description="The next match will appear once it is scheduled." />
            )}
          </section>
          <section aria-labelledby="t-results">
            <SectionHeader id="t-results" title="Recent results" />
            {results.length > 0 ? (
              <MatchCardList matches={results.slice(0, 6)} serverNow={now} />
            ) : (
              <EmptyState compact title="No results yet" />
            )}
          </section>
        </div>
        {league && window.length > 0 && (
          <aside aria-labelledby="t-table" className="min-w-0">
            <SectionHeader id="t-table" title="Table" href={`/competitions/${league.id}/table`} linkLabel="Full table" />
            <StandingsTable rows={window} caption={`${league.name} — around ${team.name}`} highlightTeamIds={[id]} compact />
          </aside>
        )}
      </div>
    </div>
  );
}
