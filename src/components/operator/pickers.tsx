"use client";

import { createContext, useContext } from "react";
import { TeamCrest } from "@/components/team/TeamCrest";
import type { PlayerStatus } from "@/lib/operator/engine";
import { hasLineup, isAvailableSub, isOnField, type ConsolePlayer, type ConsoleSquads } from "@/lib/operator/lineup";
import type { Side } from "@/lib/operator/types";
import type { Team } from "@/lib/types";

export const DEMO_SHIRTS = Array.from({ length: 25 }, (_, i) => i + 1);

/**
 * Real players per side (Supabase backend): the confirmed line-up (with
 * starter/substitute roles) or, without one, the squad. null → demo numbers.
 */
export const SquadContext = createContext<ConsoleSquads | null>(null);

/** Two very large targets, laid out like the scoreboard (home left, away right). */
export function TeamPicker({
  home,
  away,
  prompt,
  onPick,
}: {
  home: Team;
  away: Team;
  prompt: string;
  onPick: (side: Side) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-base font-bold">{prompt}</legend>
      <div className="grid grid-cols-2 gap-3">
        {(["home", "away"] as const).map((side) => {
          const team = side === "home" ? home : away;
          return (
            <button
              key={side}
              type="button"
              onClick={() => onPick(side)}
              aria-label={`${side === "home" ? "Home" : "Away"}: ${team.name}`}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-[3px] border-line bg-surface p-3 text-center hover:border-ink active:scale-[0.98] motion-reduce:active:scale-100"
              style={{ borderTopColor: team.colors.primary, borderTopWidth: 8 }}
            >
              <span className="text-xs font-extrabold tracking-widest text-ink-muted uppercase">
                {side === "home" ? "Home" : "Away"}
              </span>
              <TeamCrest team={team} size="lg" />
              <span className="line-clamp-2 text-lg leading-tight font-extrabold">{team.shortName}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Confirms which team was chosen, always visible during the rest of a flow. */
export function ChosenTeam({ team, side, label, onChange }: { team: Team; side: Side; label: string; onChange: () => void }) {
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-xl border-2 border-ink bg-subtle px-3 py-2"
      style={{ borderLeftColor: team.colors.primary, borderLeftWidth: 8 }}
    >
      <TeamCrest team={team} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold tracking-widest text-ink-muted uppercase">{label} · {side === "home" ? "Home" : "Away"}</p>
        <p className="truncate text-lg font-extrabold">{team.name}</p>
      </div>
      <button type="button" onClick={onChange} className="h-11 shrink-0 rounded-lg border-2 border-ink px-3 text-sm font-bold">
        Change
      </button>
    </div>
  );
}

export type ShirtTone = "neutral" | "off" | "on";

/** Which players a flow offers once a confirmed line-up exists. */
export type ShirtScope = "all" | "onField" | "bench";

/**
 * Shirt picker. With the live backend it lists the real line-up (names,
 * on-pitch vs bench); in the demo it shows demo numbers. Players unavailable
 * for the current action are disabled with a visible text reason.
 */
export function ShirtGrid({
  side,
  legend,
  value,
  onChange,
  statuses,
  unavailable,
  allowUnknown = false,
  tone = "neutral",
  scope = "all",
  rolling = false,
}: {
  /** Whose squad to show. */
  side: Side;
  legend: string;
  value: number | null;
  onChange: (shirt: number | null) => void;
  statuses: Map<number, PlayerStatus>;
  /** Return a short reason ("OFF", "RC") when a shirt can't be chosen. */
  unavailable?: (shirt: number, status: PlayerStatus | undefined) => string | null;
  allowUnknown?: boolean;
  tone?: ShirtTone;
  scope?: ShirtScope;
  /** Rolling substitutions: anyone off the pitch (not suspended/excluded) may come on. */
  rolling?: boolean;
}) {
  const squads = useContext(SquadContext);
  const all: ConsolePlayer[] = squads ? squads[side] : DEMO_SHIRTS.map((n) => ({ shirt: n, name: null, role: null }));
  const lineup = hasLineup(all);
  const shown = !lineup || scope === "all"
    ? all
    : all.filter((p) => (scope === "onField" ? isOnField(p, statuses.get(p.shirt)) : isAvailableSub(p, statuses.get(p.shirt), rolling)));
  const groups: { title: string | null; players: ConsolePlayer[] }[] =
    lineup && scope === "all"
      ? [
          { title: "On the pitch", players: shown.filter((p) => isOnField(p, statuses.get(p.shirt))) },
          { title: "Bench / off", players: shown.filter((p) => !isOnField(p, statuses.get(p.shirt))) },
        ]
      : [{ title: null, players: shown }];
  const selectedCls = {
    neutral: "border-ink bg-ink text-white",
    off: "border-loss bg-loss text-white",
    on: "border-win bg-win text-white",
  }[tone];
  return (
    <fieldset>
      <legend className="mb-1 text-base font-bold">{legend}</legend>
      <p className="mb-2 text-xs font-semibold text-accent-700">
        {!squads
          ? "Demo squad — shirt numbers only"
          : lineup
            ? scope === "onField"
              ? "Confirmed line-up — players on the pitch"
              : scope === "bench"
                ? rolling
                  ? "Rolling substitutions — anyone off the pitch may come on, including players who left earlier"
                  : "Confirmed line-up — substitutes available"
                : "Confirmed line-up"
            : "Squad — no confirmed line-up"}
      </p>
      {shown.length === 0 && (
        <p className="mb-2 text-sm font-bold text-live">
          {!lineup ? "No squad registered for this team." : scope === "bench" ? "No substitutes available." : "No players available."}
        </p>
      )}
      {groups.map((g) =>
        g.players.length === 0 ? null : (
          <div key={g.title ?? "all"} className="mb-2">
            {g.title && <p className="mb-1 text-[11px] font-extrabold tracking-widest text-ink-muted uppercase">{g.title}</p>}
            <div className="grid grid-cols-4 gap-2 min-[380px]:grid-cols-5">
              {g.players.map(({ shirt: n, name }) => {
                const status = statuses.get(n);
                const reason = unavailable?.(n, status) ?? null;
                const selected = value === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!!reason}
                    aria-pressed={selected}
                    aria-label={`Number ${n}${name ? `, ${name}` : ""}${reason ? `, unavailable: ${reason}` : ""}${status?.yellow ? ", booked" : ""}`}
                    onClick={() => onChange(selected && allowUnknown ? null : n)}
                    className={`relative flex min-h-13 flex-col items-center justify-center rounded-lg border-2 px-0.5 font-display text-xl font-extrabold tabular-nums disabled:border-dashed disabled:bg-subtle disabled:text-ink-faint ${
                      selected ? selectedCls : "border-line-strong bg-surface text-ink hover:border-ink"
                    }`}
                  >
                    {n}
                    {name && !reason && (
                      <span className="block w-full truncate font-sans text-[9px] leading-3 font-semibold tracking-normal normal-case">{name}</span>
                    )}
                    {reason && <span className="absolute bottom-0.5 font-sans text-[9px] font-bold tracking-wide uppercase">{reason}</span>}
                    {!reason && status?.yellow && (
                      <span className="absolute top-1 right-1 h-3 w-2 rounded-[2px] bg-accent-400 ring-1 ring-ink/40" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ),
      )}
      {allowUnknown && (
        <button
          type="button"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`mt-2 h-12 w-full rounded-lg border-2 text-sm font-bold ${
            value === null ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"
          }`}
        >
          Player not known / skip
        </button>
      )}
    </fieldset>
  );
}

export function ConfirmButton({
  label,
  onClick,
  disabled,
  tone = "brand",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "brand" | "go" | "danger" | "ink";
}) {
  const cls = { brand: "bg-brand-700", go: "bg-win", danger: "bg-live", ink: "bg-ink" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-16 w-full rounded-xl text-lg font-extrabold tracking-wide text-white uppercase disabled:opacity-40 ${cls}`}
    >
      {label}
    </button>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg border-2 border-live bg-live-soft px-3 py-2 text-sm font-bold text-live">
      ⚠ {message}
    </p>
  );
}
