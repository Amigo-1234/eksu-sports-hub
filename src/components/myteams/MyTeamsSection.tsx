"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MatchRow } from "@/components/match/MatchRow";
import { TeamCrest } from "@/components/team/TeamCrest";
import { ChevronRightIcon, StarIcon } from "@/components/ui/icons";
import { isLive } from "@/lib/status";
import type { MatchSummary, Team } from "@/lib/types";
import { MyTeamStar } from "./MyTeamStar";
import { useMyTeams } from "./my-teams";

export type PickerTeam = Pick<Team, "id" | "name" | "shortName" | "code" | "colors">;

/**
 * Home page "My Teams": each starred team's live, next or last match, first
 * thing on the page. With no teams yet, a prompt to pick some.
 */
export function MyTeamsSection({
  teams,
  groups,
  matches,
  serverNow,
}: {
  teams: PickerTeam[];
  /** Teams by competition, for the picker. */
  groups: { name: string; teamIds: string[] }[];
  /** Live, upcoming and recent matches (any order). */
  matches: MatchSummary[];
  serverNow: number;
}) {
  const mine = useMyTeams();
  const [picking, setPicking] = useState(false);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const myTeams = mine.map((id) => byId.get(id)).filter((t): t is PickerTeam => !!t);

  const pickFor = (teamId: string): MatchSummary | undefined => {
    const own = matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    return (
      own.find((m) => isLive(m.status)) ??
      own.filter((m) => m.status === "SCHEDULED").sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0] ??
      own.filter((m) => m.score).sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt))[0]
    );
  };
  // One row per match (two starred teams may meet).
  const seen = new Set<string>();

  return (
    <section aria-labelledby="my-teams" className="mb-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id="my-teams" className="flex items-center gap-1.5 font-display text-xl font-extrabold tracking-wide uppercase">
          <StarIcon size={18} filled className="text-accent-500" /> My Teams
        </h2>
        {myTeams.length > 0 && (
          <button type="button" onClick={() => setPicking(true)} className="text-sm font-bold text-brand-fg hover:underline">
            Edit
          </button>
        )}
      </div>
      {myTeams.length === 0 ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center gap-3 rounded-card border border-dashed border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-500" aria-hidden="true">
            <StarIcon size={20} filled />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Pick your teams</span>
            <span className="block text-xs text-ink-muted">Your faculty or club&apos;s matches, first thing every time you open the site.</span>
          </span>
          <ChevronRightIcon size={18} className="shrink-0 text-ink-faint" />
        </button>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {myTeams.map((t) => {
            const m = pickFor(t.id);
            if (m && seen.has(m.id)) return null;
            if (m) seen.add(m.id);
            return (
              <li key={t.id}>
                {m ? (
                  <MatchRow match={m} serverNow={serverNow} showCompetition showDate />
                ) : (
                  <Link href={`/teams/${t.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-subtle">
                    <TeamCrest team={t} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.name}</span>
                    <span className="text-xs text-ink-faint">No matches scheduled</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TeamPicker open={picking} onClose={() => setPicking(false)} teams={byId} groups={groups} />
    </section>
  );
}

function TeamPicker({
  open,
  onClose,
  teams,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  teams: Map<string, PickerTeam>;
  groups: { name: string; teamIds: string[] }[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const match = (t: PickerTeam) => !q.trim() || `${t.name} ${t.shortName} ${t.code}`.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="pick-teams-title"
      className="m-auto mb-0 max-h-[85dvh] w-full max-w-lg rounded-t-2xl bg-canvas p-0 text-ink backdrop:bg-black/50 sm:mb-auto sm:rounded-2xl"
    >
      <div className="sticky top-0 z-10 border-b border-line bg-canvas px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 id="pick-teams-title" className="font-display text-xl font-extrabold uppercase">
            Pick your teams
          </h2>
          <button type="button" onClick={onClose} className="h-9 rounded-full bg-brand-700 px-4 text-sm font-bold text-white">
            Done
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search teams"
          aria-label="Search teams"
          className="mt-3 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px] outline-none ring-brand-500/30 focus:border-brand-500 focus:ring-2"
        />
      </div>
      <div className="px-4 pb-6">
        {groups.map((g) => {
          const list = g.teamIds.map((id) => teams.get(id)).filter((t): t is PickerTeam => !!t && match(t));
          if (!list.length) return null;
          return (
            <section key={g.name} className="mt-4">
              <h3 className="mb-1 text-xs font-bold tracking-wide text-ink-muted uppercase">{g.name}</h3>
              <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-1 pr-1.5 pl-3">
                    <TeamCrest team={t} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                    <MyTeamStar teamId={t.id} teamName={t.name} compact />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </dialog>
  );
}
