"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TeamCrest } from "@/components/team/TeamCrest";
import { CheckIcon, TrophyIcon } from "@/components/ui/icons";
import type { FanGames as Games, GamesAction } from "@/lib/fan/types";
import type { Team } from "@/lib/types";
import { NameForm } from "./NameForm";

type GameTeam = Pick<Team, "id" | "code" | "colors" | "name" | "shortName">;

async function call(id: string, body?: GamesAction) {
  const res = body
    ? await fetch("/api/fan/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) })
    : await fetch(`/api/fan/games?id=${id}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({ error: "Fan games are not available right now." }));
  return { ok: res.ok, status: res.status, data: data as Games & { error?: string } };
}

/**
 * Predict the score (before kick-off, with points and a leaderboard) and
 * Player of the Match (48 hours after full-time). Lives in the Fans tab.
 */
export function FanGames({
  matchId,
  teams,
  name,
  onSignedIn,
  live,
  tick = 0,
}: {
  /** Bumped when the live channel says predictions or votes changed. */
  tick?: number;
  matchId: string;
  teams: { home: GameTeam; away: GameTeam };
  name: string | null;
  onSignedIn: () => void;
  live?: boolean;
}) {
  const [games, setGames] = useState<Games | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await call(matchId);
      if (r.ok) setGames(r.data);
      else setOff(true);
    } catch {
      /* offline */
    }
  }, [matchId]);

  useEffect(() => {
    if (tick === 0) return;
    const t = setTimeout(load, 700);
    return () => clearTimeout(t);
  }, [tick, load]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => document.visibilityState === "visible" && load(), live ? 60_000 : 300_000); // live channel pushes changes; this is a safety net
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, live]);

  const act = async (body: GamesAction) => {
    setError(null);
    try {
      const r = await call(matchId, body);
      if (r.ok) {
        setGames(r.data);
        return true;
      }
      setError(r.data.error ?? "Something went wrong. Try again.");
    } catch {
      setError("You're offline. Try again when you're connected.");
    }
    return false;
  };

  if (off || !games) return null;
  const showPredict = games.prediction.open || games.prediction.mine;

  return (
    <div className="space-y-3">
      {games.potm && <PotmCard potm={games.potm} teams={teams} onVote={(player_id) => act({ action: "potm", player_id })} />}
      {showPredict && (
        <PredictCard
          p={games.prediction}
          teams={teams}
          name={name}
          onSignedIn={() => {
            onSignedIn();
            load();
          }}
          onPredict={(home, away) => act({ action: "predict", home, away })}
        />
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-live/10 px-3 py-2 text-sm font-medium text-live">
          {error}
        </p>
      )}
    </div>
  );
}

function Stepper({ team, value, onChange, disabled }: { team: GameTeam; value: number; onChange: (n: number) => void; disabled: boolean }) {
  const btn =
    "grid size-10 place-items-center rounded-full border border-line bg-surface text-xl font-bold text-ink transition-colors hover:bg-subtle disabled:opacity-35";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <TeamCrest team={team} size="md" />
      <span className="max-w-full truncate text-sm font-bold">{team.shortName}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={disabled || value === 0} onClick={() => onChange(value - 1)} aria-label={`${team.shortName} one goal fewer`}>
          −
        </button>
        <output aria-live="polite" aria-label={`${team.shortName} goals`} className="w-9 text-center font-display text-4xl leading-none font-extrabold tabular-nums">
          {value}
        </output>
        <button type="button" className={btn} disabled={disabled || value >= 30} onClick={() => onChange(value + 1)} aria-label={`${team.shortName} one more goal`}>
          +
        </button>
      </div>
    </div>
  );
}

function PredictCard({
  p,
  teams,
  name,
  onSignedIn,
  onPredict,
}: {
  p: Games["prediction"];
  teams: { home: GameTeam; away: GameTeam };
  name: string | null;
  onSignedIn: () => void;
  onPredict: (home: number, away: number) => Promise<boolean>;
}) {
  const [home, setHome] = useState(p.mine?.home ?? 0);
  const [away, setAway] = useState(p.mine?.away ?? 0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = !p.mine || p.mine.home !== home || p.mine.away !== away;
  const points = p.mine?.points;

  return (
    <section aria-labelledby="predict-title" className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 id="predict-title" className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          Predict the score
        </h3>
        <Link href="/predictions" className="text-xs font-bold text-brand-fg hover:underline">
          Leaderboard
        </Link>
      </div>
      <div className="px-4 py-4">
        {p.open ? (
          <>
            <div className="flex items-start gap-2">
              <Stepper team={teams.home} value={home} onChange={setHome} disabled={busy} />
              <span aria-hidden="true" className="pt-[4.25rem] font-display text-2xl font-bold text-ink-faint">
                –
              </span>
              <Stepper team={teams.away} value={away} onChange={setAway} disabled={busy} />
            </div>
            {name ? (
              <button
                type="button"
                disabled={busy || !changed}
                onClick={async () => {
                  setBusy(true);
                  const ok = await onPredict(home, away);
                  setBusy(false);
                  if (ok) {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2500);
                  }
                }}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[15px] font-bold text-white transition-colors hover:bg-brand-600 disabled:bg-subtle disabled:text-ink-muted"
              >
                {saved ? (
                  <>
                    <CheckIcon size={18} /> Prediction saved
                  </>
                ) : p.mine && !changed ? (
                  <>
                    <CheckIcon size={18} /> Locked in: {p.mine.home}–{p.mine.away}
                  </>
                ) : p.mine ? (
                  "Update prediction"
                ) : (
                  "Lock in prediction"
                )}
              </button>
            ) : (
              <NameForm onSignedIn={onSignedIn} className="mt-4" label="What should we call you on the leaderboard?" />
            )}
            <p className="mt-2 text-center text-xs text-ink-faint">
              3 points for the exact score, 1 for the right result. You can change it until kick-off.
            </p>
          </>
        ) : (
          p.mine && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink-muted">Your prediction</p>
                <p className="font-display text-3xl font-extrabold tabular-nums">
                  {teams.home.shortName} {p.mine.home}–{p.mine.away} {teams.away.shortName}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                  points == null ? "bg-subtle text-ink-muted" : points === 3 ? "bg-win text-canvas" : points === 1 ? "bg-accent-400 text-ink" : "bg-subtle text-ink-muted"
                }`}
              >
                {points == null ? "Closed" : points === 3 ? "+3 Exact!" : points === 1 ? "+1 Result" : "0 pts"}
              </span>
            </div>
          )
        )}
        {(p.count > 0 || p.popular.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs">
            <span className="font-bold text-ink-muted">
              {p.count} {p.count === 1 ? "prediction" : "predictions"}
              {p.popular.length > 0 && " · Popular:"}
            </span>
            {p.popular.map((s) => (
              <span key={`${s.home}-${s.away}`} className="rounded-full bg-subtle px-2 py-0.5 font-bold tabular-nums">
                {s.home}–{s.away} <span className="font-medium text-ink-faint">×{s.n}</span>
              </span>
            ))}
            {p.exact != null && <span className="ml-auto font-bold text-win">{p.exact} got it exactly</span>}
          </div>
        )}
      </div>
    </section>
  );
}

function PotmCard({
  potm,
  teams,
  onVote,
}: {
  potm: NonNullable<Games["potm"]>;
  teams: { home: GameTeam; away: GameTeam };
  onVote: (playerId: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (potm.candidates.length === 0) return null;
  const team = (id: string) => (id === teams.home.id ? teams.home : teams.away);
  const leader = potm.total > 0 ? potm.candidates[0] : null;
  const showVotes = !potm.open || !!potm.mine;
  const list = all ? potm.candidates : potm.candidates.slice(0, 6);

  return (
    <section aria-labelledby="potm-title" className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 id="potm-title" className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          Player of the Match
        </h3>
        <span className="text-xs text-ink-faint">
          {potm.total} {potm.total === 1 ? "vote" : "votes"}
          {!potm.open && " · closed"}
        </span>
      </div>
      {leader && (showVotes || !potm.open) && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-accent-100 to-transparent px-4 py-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-400 text-ink" aria-hidden="true">
            <TrophyIcon size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{potm.open ? "Leading the vote" : "Fans' Player of the Match"}</p>
            <p className="truncate text-lg font-extrabold">{leader.name}</p>
            <p className="text-xs text-ink-muted">
              {team(leader.team_id).shortName} · {Math.round((leader.votes / potm.total) * 100)}% of votes
            </p>
          </div>
        </div>
      )}
      <ul className="divide-y divide-line">
        {list.map((c) => {
          const mine = potm.mine === c.id;
          const pct = potm.total ? Math.round((c.votes / potm.total) * 100) : 0;
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={!potm.open || busy !== null}
                aria-pressed={mine}
                onClick={async () => {
                  setBusy(c.id);
                  await onVote(c.id);
                  setBusy(null);
                }}
                className={`relative flex w-full items-center gap-3 overflow-hidden px-4 py-2.5 text-left transition-colors enabled:hover:bg-subtle disabled:cursor-default ${
                  mine ? "bg-brand-50" : ""
                }`}
              >
                {showVotes && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-brand-500/10" style={{ width: `${pct}%` }} />}
                <TeamCrest team={team(c.team_id)} size="sm" className="relative" />
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{c.name}</span>
                  <span className="block text-xs text-ink-faint">
                    {team(c.team_id).shortName}
                    {c.shirt != null && ` · No. ${c.shirt}`}
                  </span>
                </span>
                {mine && <CheckIcon size={16} className="relative text-brand-fg" />}
                {showVotes && <span className="relative w-10 text-right text-sm font-bold tabular-nums">{pct}%</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {potm.candidates.length > 6 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="w-full border-t border-line py-2.5 text-sm font-bold text-brand-fg hover:bg-subtle">
          {all ? "Show fewer" : `Show all ${potm.candidates.length} players`}
        </button>
      )}
      {potm.open && !potm.mine && <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">Tap a player to vote. Open for 48 hours after full-time.</p>}
    </section>
  );
}
