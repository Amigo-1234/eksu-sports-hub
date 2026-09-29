import type { ReactNode } from "react";
import { BallIcon } from "@/components/ui/icons";
import type { PitchPlayer } from "@/lib/lineup";

/**
 * Responsive football pitch. Everything is positioned in percentages of the
 * pitch box (normalised 0–100 coordinates), so it scales to any width and
 * never overflows. Team attacks upwards.
 */
export function PitchFrame({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[26rem] ${className}`}>
      <div className="relative aspect-[7/9] w-full overflow-hidden rounded-card bg-pitch">
        <svg
          viewBox="0 0 70 90"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x="0" y={i * 10} width="70" height="5" className="fill-pitch-stripe" />
          ))}
          <g fill="none" className="stroke-pitch-line" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
            <rect x="2" y="2" width="66" height="86" />
            <line x1="2" y1="45" x2="68" y2="45" />
            <ellipse cx="35" cy="45" rx="7" ry="7" />
            <rect x="17" y="2" width="36" height="13" />
            <rect x="26" y="2" width="18" height="5" />
            <rect x="17" y="75" width="36" height="13" />
            <rect x="26" y="83" width="18" height="5" />
          </g>
        </svg>
        <ol aria-label={label} className="absolute inset-0 m-0 list-none p-0">
          {children}
        </ol>
      </div>
    </div>
  );
}

/** Positions its child with its centre at (x, y) on the pitch. */
export function PitchSpot({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  // Keep markers inside the pitch whatever the coordinates.
  const cx = Math.min(92, Math.max(8, x));
  const cy = Math.min(94, Math.max(6, y));
  return (
    <li className="absolute flex w-[23%] -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${cx}%`, top: `${cy}%` }}>
      {children}
    </li>
  );
}

function minute(m: { minute: number; extra: number }) {
  return m.extra ? `${m.minute}+${m.extra}'` : `${m.minute}'`;
}

export function PlayerMarker({
  player,
  colors,
}: {
  player: PitchPlayer;
  colors: { primary: string; secondary: string };
}) {
  const label = [
    `${player.name ?? "Player"}, number ${player.shirt}`,
    player.position,
    player.captain && "captain",
    player.goalkeeper && "goalkeeper",
    player.cameOn && `came on ${minute(player.cameOn)}`,
    player.booked && "booked",
    player.goals ? `${player.goals} goal${player.goals > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="relative">
        <span
          className="grid size-8 place-items-center rounded-full border-2 font-display text-sm font-extrabold tabular-nums shadow-sm sm:size-9 sm:text-base"
          style={
            player.goalkeeper
              ? { background: "var(--color-accent-400)", color: "var(--color-ink)", borderColor: "var(--color-ink)" }
              : { background: colors.primary, color: colors.secondary, borderColor: colors.secondary }
          }
        >
          {player.shirt}
        </span>
        {player.captain && (
          <span className="absolute -top-1 -left-1.5 grid size-4 place-items-center rounded-full bg-ink text-[9px] font-black text-white">C</span>
        )}
        {player.booked && <span className="absolute -top-1 -right-1 h-3 w-2 rounded-[2px] bg-accent-400 ring-1 ring-ink/40" />}
        {!!player.goals && (
          <span className="absolute -right-2 -bottom-1 flex items-center rounded-full bg-surface px-0.5 text-[9px] leading-4 font-black text-ink">
            <BallIcon size={11} />
            {player.goals > 1 ? player.goals : ""}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="mt-0.5 max-w-full truncate rounded bg-ink/55 px-1 text-[10px] leading-4 font-semibold text-white sm:text-[11px]">
        {player.cameOn && <span className="text-accent-300">↑ </span>}
        {player.name ?? `No. ${player.shirt}`}
      </span>
    </>
  );
}

export function Pitch({
  players,
  colors,
  label,
}: {
  players: PitchPlayer[];
  colors: { primary: string; secondary: string };
  label: string;
}) {
  return (
    <PitchFrame label={label}>
      {players.map((p) => (
        <PitchSpot key={p.shirt} x={p.x} y={p.y}>
          <PlayerMarker player={p} colors={colors} />
        </PitchSpot>
      ))}
    </PitchFrame>
  );
}
