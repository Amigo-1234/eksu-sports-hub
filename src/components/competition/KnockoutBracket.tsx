"use client";

import Link from "next/link";
import { useState } from "react";
import { TeamCrest } from "@/components/team/TeamCrest";
import { formatShortDate, formatTime } from "@/lib/format";
import { isLive, statusShortLabel } from "@/lib/status";
import type { PublicTie, TieSide } from "@/lib/types";

export interface BracketRound {
  id: string;
  name: string;
  ties: PublicTie[];
}

function SideRow({ side, score, pens, winner, decided }: { side: TieSide; score: number | null; pens: number | null; winner: boolean; decided: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${decided && !winner ? "text-ink-faint" : ""}`}>
      {side.team ? (
        <TeamCrest team={side.team} size="sm" />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-[10px] text-ink-faint" aria-hidden="true">
          ?
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate text-sm ${winner ? "font-extrabold" : side.team ? "font-semibold" : "text-ink-muted italic"}`}>
        {side.team ? side.team.shortName : side.label}
      </span>
      {score != null && (
        <span className={`font-display text-base tabular-nums ${winner ? "font-extrabold" : "font-bold"}`}>
          {score}
          {pens != null && <span className="ml-0.5 text-xs font-bold text-ink-muted">({pens})</span>}
        </span>
      )}
    </div>
  );
}

function statusText(t: PublicTie): string {
  if (t.underReview) return "Result under review";
  if (t.status && isLive(t.status)) return t.status === "PENALTIES" ? "Live · penalties" : "Live";
  if (t.status === "FULL_TIME") return t.decidedBy === "PENALTIES" ? "FT · pens" : t.decidedBy === "EXTRA_TIME" ? "AET" : "FT";
  if (t.status && statusShortLabel(t.status)) return statusShortLabel(t.status)!;
  if (t.decidedBy === "ADMIN" && t.winnerTeamId) return "Decided";
  if (t.kickoffAt) return `${formatShortDate(t.kickoffAt)} · ${formatTime(t.kickoffAt)}`;
  return "Date to be confirmed";
}

/** One tie: both sides (team or placeholder), score/pens, status; links to the match. */
export function TieCard({ tie }: { tie: PublicTie }) {
  const decided = Boolean(tie.winnerTeamId);
  const live = tie.status ? isLive(tie.status) : false;
  const label = `${tie.code}: ${tie.home.team?.name ?? tie.home.label} versus ${tie.away.team?.name ?? tie.away.label}${
    tie.score ? `, ${tie.score.home}–${tie.score.away}` : ""
  }${tie.shootout ? `, ${tie.shootout.home}–${tie.shootout.away} on penalties` : ""}. ${statusText(tie)}.`;
  const body = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
        <span>{tie.code}</span>
        <span className={live ? "text-live" : tie.underReview ? "text-warn" : ""}>{statusText(tie)}</span>
      </div>
      <div className="space-y-1.5" aria-hidden="true">
        <SideRow side={tie.home} score={tie.score?.home ?? null} pens={tie.shootout?.home ?? null} winner={decided && tie.winnerTeamId === tie.home.team?.id} decided={decided} />
        <SideRow side={tie.away} score={tie.score?.away ?? null} pens={tie.shootout?.away ?? null} winner={decided && tie.winnerTeamId === tie.away.team?.id} decided={decided} />
      </div>
      <span className="sr-only">{label}</span>
    </>
  );
  const cls = `block rounded-card border bg-surface p-3 ${live ? "border-live" : "border-line"}`;
  return tie.matchId ? (
    <Link href={`/matches/${tie.matchId}`} className={`${cls} hover:border-brand-600`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Knockout bracket. Desktop: rounds side by side. Phones: one round at a
 * time with a round switcher — never a giant horizontal scroll.
 */
export function KnockoutBracket({ rounds, thirdPlace }: { rounds: BracketRound[]; thirdPlace?: PublicTie | null }) {
  const firstOpen = rounds.findIndex((r) => r.ties.some((t) => !t.winnerTeamId));
  const [active, setActive] = useState(firstOpen === -1 ? rounds.length - 1 : firstOpen);
  const round = rounds[active];

  return (
    <div>
      {/* Phones / tablets: round by round */}
      <div className="lg:hidden">
        <div role="tablist" aria-label="Rounds" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-2">
          {rounds.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold whitespace-nowrap ${
                i === active ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
        {round && (
          <div role="tabpanel" aria-label={round.name}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {round.ties.map((t) => (
                <li key={t.id}>
                  <TieCard tie={t} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between gap-2">
              <button type="button" disabled={active === 0} onClick={() => setActive((a) => a - 1)} className="h-10 rounded-lg border border-line px-3 text-sm font-bold disabled:opacity-40">
                ← {rounds[active - 1]?.name ?? "Previous"}
              </button>
              <button type="button" disabled={active === rounds.length - 1} onClick={() => setActive((a) => a + 1)} className="h-10 rounded-lg border border-line px-3 text-sm font-bold disabled:opacity-40">
                {rounds[active + 1]?.name ?? "Next"} →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: the full bracket */}
      <div className="hidden gap-4 lg:grid" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}>
        {rounds.map((r) => (
          <section key={r.id} aria-label={r.name} className="flex min-w-0 flex-col">
            <h3 className="mb-2 text-center text-xs font-extrabold tracking-widest text-ink-muted uppercase">{r.name}</h3>
            <ul className="flex flex-1 flex-col justify-around gap-3">
              {r.ties.map((t) => (
                <li key={t.id}>
                  <TieCard tie={t} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {thirdPlace && (
        <section aria-label="Third-place match" className="mt-6 max-w-sm">
          <h3 className="mb-2 text-xs font-extrabold tracking-widest text-ink-muted uppercase">Third-place match</h3>
          <TieCard tie={thirdPlace} />
        </section>
      )}
    </div>
  );
}
