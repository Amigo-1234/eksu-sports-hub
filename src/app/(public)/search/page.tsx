import type { Metadata } from "next";
import Link from "next/link";
import { CompetitionBadge, competitionMeta } from "@/components/competition/CompetitionLinkList";
import { MyTeamStar } from "@/components/myteams/MyTeamStar";
import { SearchBox } from "@/components/search/SearchBox";
import { TeamCrest } from "@/components/team/TeamCrest";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChevronRightIcon, ShirtIcon } from "@/components/ui/icons";
import { getCompetitions, getMatches, getRegisteredTeamIds, getTeams, searchPlayers } from "@/lib/data";
import { param } from "@/lib/filters";
import type { Team } from "@/lib/types";

export const metadata: Metadata = { title: "Search", description: "Find EKSU teams, players and leagues." };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Every team a fan can open: in a public fixture, or registered with a current squad. */
async function publicTeams(): Promise<Team[]> {
  const [teams, registered, upcoming, results, live] = await Promise.all([
    getTeams(),
    getRegisteredTeamIds().catch((): string[] => []),
    getMatches({ scope: "upcoming" }),
    getMatches({ scope: "results" }),
    getMatches({ scope: "live" }),
  ]);
  const ids = new Set(registered);
  for (const m of [...upcoming, ...results, ...live]) ids.add(m.homeTeamId).add(m.awayTeamId);
  return teams.filter((t) => ids.has(t.id) && !/\(test\)/i.test(t.name));
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const q = (param((await searchParams).q) ?? "").slice(0, 60);
  const term = norm(q);
  const [teams, competitions] = await Promise.all([publicTeams(), getCompetitions()]);

  const score = (hay: string) => {
    const h = norm(hay);
    if (!term) return 0;
    if (h.startsWith(term)) return 3;
    if (h.split(" ").some((w) => w.startsWith(term))) return 2;
    return h.includes(term) ? 1 : 0;
  };
  const teamHits = term
    ? teams
        .map((t) => ({ t, s: Math.max(score(t.name), score(t.shortName), score(t.code)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name))
        .slice(0, 12)
        .map((x) => x.t)
    : [];
  const leagueHits = term ? competitions.filter((c) => score(`${c.name} ${c.shortName}`) > 0).slice(0, 8) : [];
  const players = term.length >= 2 ? await searchPlayers(q) : [];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const playerHits = players.filter((p) => teamById.has(p.teamId));
  const nothing = term && !teamHits.length && !leagueHits.length && !playerHits.length;

  const heading = "mb-2 text-xs font-bold tracking-wide text-ink-muted uppercase";
  const list = "divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Search" />
      <SearchBox initial={q} />

      <div className="mt-5 space-y-6">
        {!term && (
          <>
            <p className="px-1 text-sm text-ink-muted">Search for a team, a player or a league. Popular teams:</p>
            <ul className="flex flex-wrap gap-2">
              {teams.slice(0, 16).map((t) => (
                <li key={t.id}>
                  <Link href={`/teams/${t.id}`} className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-3.5 pl-1.5 text-sm font-semibold shadow-card hover:bg-subtle">
                    <TeamCrest team={t} size="sm" />
                    {t.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {teamHits.length > 0 && (
          <section aria-labelledby="hits-teams">
            <h2 id="hits-teams" className={heading}>Teams</h2>
            <ul className={list}>
              {teamHits.map((t) => (
                <li key={t.id} className="flex items-center pr-1.5">
                  <Link href={`/teams/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                    <TeamCrest team={t} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{t.name}</span>
                      <span className="block text-xs text-ink-faint">{t.code}</span>
                    </span>
                  </Link>
                  <MyTeamStar teamId={t.id} teamName={t.name} compact />
                </li>
              ))}
            </ul>
          </section>
        )}

        {playerHits.length > 0 && (
          <section aria-labelledby="hits-players">
            <h2 id="hits-players" className={heading}>Players</h2>
            <ul className={list}>
              {playerHits.map((p) => {
                const t = teamById.get(p.teamId)!;
                return (
                  <li key={`${p.teamId}-${p.shirt}-${p.name}`}>
                    <Link href={`/teams/${t.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-sm font-extrabold tabular-nums">{p.shirt}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                          <TeamCrest team={t} size="xs" /> {t.name}
                        </span>
                      </span>
                      <ShirtIcon size={16} className="text-ink-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {leagueHits.length > 0 && (
          <section aria-labelledby="hits-leagues">
            <h2 id="hits-leagues" className={heading}>Leagues</h2>
            <ul className={list}>
              {leagueHits.map((c) => (
                <li key={c.id}>
                  <Link href={`/competitions/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                    <CompetitionBadge competition={c} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.name}</span>
                      <span className="block truncate text-xs text-ink-faint">{competitionMeta(c)}</span>
                    </span>
                    <ChevronRightIcon size={16} className="text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nothing && (
          <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
            Nothing found for “{q}”. Try a shorter name, a team code (e.g. DSD) or a player&apos;s surname.
          </p>
        )}
      </div>
    </div>
  );
}
