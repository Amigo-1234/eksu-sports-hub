import Link from "next/link";
import { MatchesByCompetition, MatchesByDate } from "@/components/match/MatchList";
import { LiveDot } from "@/components/match/MatchStatusLabel";
import { StandingsTable } from "@/components/standings/StandingsTable";
import { CompetitionLinkList } from "@/components/competition/CompetitionLinkList";
import { OpenOnboardingButton } from "@/components/onboarding/Onboarding";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { BellIcon, DownloadIcon } from "@/components/ui/icons";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CalendarIcon, ChevronRightIcon, ClockIcon } from "@/components/ui/icons";
import { LiveScoresProvider } from "@/components/realtime/LiveScores";
import { DATA_SOURCE_KIND, getCompetitions, getMatches, getNow, getStandings } from "@/lib/data";
import { NewsList } from "@/components/news/NewsList";
import { listNews } from "@/lib/news/public";
import { dateKey, formatKickoff, formatLongDate } from "@/lib/format";
import { matchHref } from "@/lib/match";
import { isLive } from "@/lib/status";

const PREVIEW_LIMIT = 5;

export default async function HomePage() {
  const now = await getNow();
  const today = dateKey(now);

  const [live, todays, upcoming, results, competitions, news] = await Promise.all([
    getMatches({ scope: "live" }),
    getMatches({ date: today }),
    getMatches({ scope: "upcoming" }),
    getMatches({ scope: "results" }),
    getCompetitions(),
    listNews(3),
  ]);

  const todayOther = todays.filter((m) => !isLive(m.status));
  const laterFixtures = upcoming.filter((m) => dateKey(m.kickoffAt) > today).slice(0, PREVIEW_LIMIT);
  const recentResults = results.filter((m) => dateKey(m.kickoffAt) < today).slice(0, PREVIEW_LIMIT);
  const nextUp = upcoming.find((m) => m.status === "SCHEDULED");

  const featured = competitions.find((c) => c.format === "league");
  const table = featured ? (await getStandings(featured.id)).slice(0, PREVIEW_LIMIT) : [];

  const nothingAtAll = todays.length === 0 && upcoming.length === 0 && results.length === 0;

  return (
    <LiveScoresProvider enabled={DATA_SOURCE_KIND === "live"} renderedLiveIds={live.map((m) => m.id)}>
    <div className="pt-3 sm:pt-4">
      <h1 className="sr-only">EKSU Sports — live scores, fixtures and results</h1>
      <p className="mb-2.5 flex items-center gap-2 px-1 text-[11px] font-bold tracking-[0.1em] text-ink-faint uppercase">
        <time dateTime={today}>{formatLongDate(new Date(now).toISOString())}</time>
        <span aria-hidden="true">·</span>
        <span>WAT</span>
      </p>

      {nothingAtAll ? (
        <EmptyState
          icon={<CalendarIcon size={18} />}
          title="No matches scheduled"
          description="Fixtures will appear here as soon as the organisers publish them."
          action={{ href: "/competitions", label: "Browse competitions" }}
        />
      ) : (
        <div className="grid gap-x-5 gap-y-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            {live.length > 0 ? (
              <section aria-labelledby="live-now">
                <SectionHeader
                  id="live-now"
                  title="Live"
                  href="/live"
                  linkLabel="Live centre"
                  adornment={
                    <span className="flex items-center gap-1.5 rounded-full bg-live-soft px-2 py-0.5 font-sans text-xs font-bold tracking-normal text-live normal-case">
                      <LiveDot />
                      {live.length}
                      <span className="sr-only"> in progress</span>
                    </span>
                  }
                />
                <MatchesByCompetition matches={live} serverNow={now} />
              </section>
            ) : (
              <section aria-label="Live status">
                <div className="flex items-center gap-3 rounded-card border border-line bg-surface py-2 pr-1.5 pl-3">
                  <span className="relative flex size-2 shrink-0 rounded-full bg-ink-faint/60" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">No live matches right now</p>
                    {nextUp && (
                      <p className="truncate text-xs text-ink-muted">
                        Next: {formatKickoff(nextUp.kickoffAt, now)} · {nextUp.homeTeam.shortName} v{" "}
                        {nextUp.awayTeam.shortName}
                      </p>
                    )}
                  </div>
                  {nextUp && (
                    <Link
                      href={matchHref(nextUp.id)}
                      aria-label={`Next match: ${nextUp.homeTeam.name} versus ${nextUp.awayTeam.name}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-subtle hover:text-ink"
                    >
                      <ChevronRightIcon size={18} />
                    </Link>
                  )}
                </div>
              </section>
            )}

            {news.length > 0 && (
              <section aria-labelledby="news">
                <SectionHeader id="news" title="News" href="/news" linkLabel="All news" />
                <NewsList posts={news} />
              </section>
            )}

            {todayOther.length > 0 && (
              <section aria-labelledby="today">
                <SectionHeader
                  id="today"
                  title={live.length > 0 ? "Also today" : "Today"}
                  href="/fixtures"
                  linkLabel="Fixtures"
                />
                <MatchesByCompetition matches={todayOther} serverNow={now} />
              </section>
            )}

            <section aria-labelledby="upcoming">
              <SectionHeader id="upcoming" title="Upcoming" href="/fixtures" linkLabel="All fixtures" />
              {laterFixtures.length > 0 ? (
                <MatchesByDate matches={laterFixtures} serverNow={now} />
              ) : (
                <EmptyState
                  icon={<CalendarIcon size={18} />}
                  title="No upcoming fixtures"
                  description="Your next fixtures will appear here."
                />
              )}
            </section>

            <section aria-labelledby="results">
              <SectionHeader id="results" title="Results" href="/results" linkLabel="All results" />
              {recentResults.length > 0 ? (
                <MatchesByDate matches={recentResults} serverNow={now} />
              ) : (
                <EmptyState
                  icon={<ClockIcon size={18} />}
                  title="No results yet"
                  description="Completed matches will appear here."
                />
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-[calc(var(--header-total)+1rem)] lg:self-start" aria-label="Tables and competitions">
            {featured && table.length > 0 && (
              <section aria-labelledby="table-preview">
                <SectionHeader
                  id="table-preview"
                  title="Table"
                  href={`/competitions/${featured.id}/table`}
                  linkLabel="Full table"
                />
                <StandingsTable
                  rows={table}
                  caption={`${featured.name} — top ${table.length}`}
                  title={featured.name}
                  compact
                />
              </section>
            )}
            <section aria-labelledby="competitions">
              <SectionHeader id="competitions" title="Competitions" href="/competitions" linkLabel="All" />
              <CompetitionLinkList competitions={competitions} />
            </section>
            <OpenOnboardingButton className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-3 text-left shadow-card transition-colors hover:bg-subtle">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-fg" aria-hidden="true">
                <DownloadIcon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Install the app &amp; get match alerts</span>
                <span className="block text-xs text-ink-muted">Home Screen access, goals and results as they happen</span>
              </span>
              <BellIcon size={18} className="shrink-0 text-ink-faint" />
            </OpenOnboardingButton>
            <ThemeToggle variant="row" initial={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} className="lg:hidden" />
          </aside>
        </div>
      )}

      <DemoNotice />
    </div>
    </LiveScoresProvider>
  );
}
