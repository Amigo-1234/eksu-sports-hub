"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live countdown to kick-off. Starts from the server time so the first render matches. */
export function KickoffCountdown({ kickoffAt, serverNow }: { kickoffAt: string; serverNow: number }) {
  const target = Date.parse(kickoffAt);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    // Keep the server/client offset so a wrong phone clock doesn't skew the countdown.
    const offset = serverNow - Date.now();
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [serverNow]);

  const left = target - now;
  if (left <= 0) {
    return <p className="text-sm font-bold tracking-wide text-accent-400 uppercase">Kick-off time</p>;
  }
  const { d, h, m, s } = parts(left);
  const cells: [number, string][] = [
    ...(d > 0 ? ([[d, d === 1 ? "day" : "days"]] as [number, string][]) : []),
    [h, "hrs"],
    [m, "min"],
    [s, "sec"],
  ];
  return (
    <div className="flex items-stretch justify-center gap-1.5" role="timer" aria-label="Time until kick-off">
      {cells.map(([v, label]) => (
        <div key={label} className="min-w-[3.25rem] rounded-lg bg-black/25 px-2 py-1.5 text-center ring-1 ring-white/10">
          <span className="block font-display text-2xl leading-none font-extrabold tabular-nums">
            {String(v).padStart(2, "0")}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold tracking-[0.12em] text-white/60 uppercase">{label}</span>
        </div>
      ))}
    </div>
  );
}
