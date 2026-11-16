"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { detectAlerts, soundFor, type LiveAlert, type SoundKind } from "@/lib/live/alerts";
import { SOUND_KINDS, audioReady, playSound, readSoundPrefs, unlockAudio, writeSoundPrefs, type SoundPrefs } from "@/lib/live/sounds";
import { isLive } from "@/lib/status";
import { useLiveMatch } from "./LiveMatch";

/* ── Sound preference store (shared by the button and the alert layer) ─── */

const listeners = new Set<() => void>();
let cache: SoundPrefs | null = null;
const getPrefs = () => (cache ??= readSoundPrefs());
const SERVER_PREFS: SoundPrefs = { on: false, off: [] };
function setPrefs(p: SoundPrefs) {
  cache = p;
  writeSoundPrefs(p);
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const usePrefs = () => useSyncExternalStore(subscribe, getPrefs, () => SERVER_PREFS);

/** After a reload with sound left on, the browser needs one tap before audio may play again. */
function useResumeOnFirstTap(on: boolean) {
  useEffect(() => {
    if (!on || audioReady()) return;
    const go = () => void unlockAudio().then(() => listeners.forEach((l) => l()));
    const opts = { once: true, capture: true } as const;
    window.addEventListener("pointerdown", go, opts);
    window.addEventListener("keydown", go, opts);
    return () => {
      window.removeEventListener("pointerdown", go, opts);
      window.removeEventListener("keydown", go, opts);
    };
  }, [on]);
}

const QUIET_AFTER_GAP_MS = 90_000; // a catch-up after being away/offline never plays sounds
const SHOW_MS = 5_500;
const QUEUED_MS = 2_400;

type Queued = LiveAlert & { play: SoundKind | null };

/**
 * Watches the live match (already kept current by LiveMatchProvider) and shows
 * one alert at a time for new events and half-time/full-time, playing the
 * matching sound when the visitor has switched sound on. The server-rendered
 * state is the baseline, so opening or refreshing a match never alerts.
 */
export function LiveMatchAlerts() {
  const match = useLiveMatch();
  const prefs = usePrefs();
  useResumeOnFirstTap(prefs.on);

  const prev = useRef(match);
  const lastUpdate = useRef(0);
  useEffect(() => {
    lastUpdate.current = Date.now(); // the moment this page started watching
  }, []);
  const shown = useRef(new Set<string>());
  const [queue, setQueue] = useState<Queued[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = match;
    const now = Date.now();
    const gap = now - lastUpdate.current;
    lastUpdate.current = now;
    if (before === match) return;

    const batch = detectAlerts(before, match).filter((a) => !shown.current.has(a.key));
    if (batch.length === 0) return;
    batch.forEach((a) => shown.current.add(a.key));
    if (document.visibilityState !== "visible") return;

    const quiet = gap > QUIET_AFTER_GAP_MS;
    const p = getPrefs();
    // One sound per update (the most important), played when its alert appears.
    const kind = p.on && !quiet ? soundFor(batch, (k: SoundKind) => !p.off.includes(k)) : null;
    let claimed = false;
    const items: Queued[] = batch.map((a) => {
      const play = !claimed && kind !== null && a.sound === kind;
      if (play) claimed = true;
      return { ...a, play: play ? kind : null };
    });
    // Catching up after a long gap: only the latest, most important alert.
    const toShow = quiet ? [items.reduce((a, b) => (b.priority >= a.priority ? b : a))] : items;
    setQueue((q) => [...q, ...toShow].slice(-4));
  }, [match]);

  const current = queue[0];
  const waiting = queue.length > 1;
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  useEffect(() => {
    if (!current) return;
    if (current.play && getPrefs().on && document.visibilityState === "visible") playSound(current.play);
  }, [current]);
  useEffect(() => {
    if (!current) return;
    // More alerts waiting: keep each one brief so the newest is never stale.
    const t = setTimeout(dismiss, waiting ? QUEUED_MS : current.sound === "goal" ? SHOW_MS + 1500 : SHOW_MS);
    return () => clearTimeout(t);
  }, [current, waiting, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--header-h)+var(--header-stripe)+0.5rem)] z-50 flex justify-center px-3" aria-live="polite" role="status">
      {current && (
        <div
          key={current.key}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] motion-safe:animate-[onb-rise_.3s_ease-out] ${
            current.sound === "goal" ? "border-win/40 bg-surface ring-2 ring-win/30" : "border-line bg-surface"
          }`}
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            {current.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block font-display leading-tight font-extrabold tracking-wide uppercase ${current.sound === "goal" ? "text-[22px] text-win" : "text-[17px]"}`}>
              {current.title}
            </span>
            {current.scoreLine && <span className="block truncate text-sm font-bold tabular-nums">{current.scoreLine}</span>}
            {current.detail && <span className="block truncate text-[13px] text-ink-muted">{current.detail}</span>}
          </span>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-subtle hover:text-ink">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6M22 9l-6 6" />}
    </svg>
  );
}

/** Sound on/off for live match alerts, with per-event choices. Shown while a match is upcoming or live. */
export function LiveSoundControls() {
  const match = useLiveMatch();
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  if (!(isLive(match.status) || match.status === "SCHEDULED" || match.status === "HALF_TIME")) return null;

  const ready = prefs.on && audioReady();
  const toggle = async () => {
    if (prefs.on) return setPrefs({ ...prefs, on: false });
    const ok = await unlockAudio(); // this tap is the user gesture browsers require
    setPrefs({ ...prefs, on: true });
    if (ok) playSound("sub"); // short confirmation blip
  };

  return (
    <div className="contents">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={prefs.on}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
          prefs.on ? "border-brand-600 bg-brand-50 text-brand-fg" : "border-line bg-surface text-ink hover:bg-subtle"
        }`}
      >
        <SpeakerIcon on={prefs.on} />
        {prefs.on ? (ready ? "Sound on" : "Sound on · tap to start") : "Sound off"}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Sound settings"
        className="grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-muted hover:bg-subtle hover:text-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <fieldset className="order-last w-full basis-full rounded-2xl border border-line bg-surface p-3 sm:ml-auto sm:max-w-xs">
          <legend className="sr-only">Play a sound for</legend>
          <p className="mb-2 text-xs font-bold tracking-wide text-ink-muted uppercase">Play a sound for</p>
          {SOUND_KINDS.map(({ kind, label }) => (
            <label key={kind} className="flex min-h-10 items-center justify-between gap-3 text-sm font-medium">
              {label}
              <input
                type="checkbox"
                className="size-5 accent-brand-700"
                checked={!prefs.off.includes(kind)}
                onChange={(e) => setPrefs({ ...prefs, off: e.target.checked ? prefs.off.filter((k) => k !== kind) : [...prefs.off, kind] })}
              />
            </label>
          ))}
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">Sounds play only while this page is open. Phone notifications use your device&apos;s own sound.</p>
        </fieldset>
      )}
    </div>
  );
}
