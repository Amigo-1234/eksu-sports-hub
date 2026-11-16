/**
 * Match sounds, synthesised with the Web Audio API: original, a few hundred
 * bytes of code, nothing to download or license. Browsers only allow audio
 * after a user gesture, so the context is created/resumed from the visitor's
 * own tap (see unlockAudio). On iOS the "ambient" audio session respects the
 * silent switch.
 */
import type { SoundKind } from "./alerts.ts";

let ctx: AudioContext | null = null;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession) nav.audioSession.type = "ambient"; // obey the ringer/silent switch (Safari)
    } catch {
      /* not supported */
    }
    ctx = new AC();
  }
  return ctx;
}

/** Call from a user gesture (tap/click/keypress). Returns true when audio can play. */
export async function unlockAudio(): Promise<boolean> {
  const c = context();
  if (!c) return false;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  return c.state === "running";
}

export const audioReady = () => ctx?.state === "running";

function tone(c: AudioContext, out: AudioNode, at: number, freq: number, dur: number, type: OscillatorType, gain = 0.5, glideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.setValueAtTime(gain, at + Math.max(0.02, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Referee whistle: a high tone with the pea's fast trill. */
function whistle(c: AudioContext, out: AudioNode, at: number, dur: number) {
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const depth = c.createGain();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 2850;
  lfo.frequency.value = 32;
  depth.gain.value = 140;
  lfo.connect(depth).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.28, at + 0.02);
  g.gain.setValueAtTime(0.28, at + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  lfo.start(at);
  o.stop(at + dur + 0.02);
  lfo.stop(at + dur + 0.02);
}

/** A short swell of filtered noise: the crowd. */
function roar(c: AudioContext, out: AudioNode, at: number, dur: number) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.22, at + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur);
}

const PATTERNS: Record<SoundKind, (c: AudioContext, out: AudioNode, t: number) => void> = {
  // Rising stadium fanfare over a crowd swell: the one everybody should recognise.
  goal: (c, out, t) => {
    roar(c, out, t, 1.9);
    [523.25, 659.25, 783.99].forEach((f, i) => tone(c, out, t + i * 0.11, f, 0.16, "sawtooth", 0.16));
    tone(c, out, t + 0.33, 1046.5, 0.75, "sawtooth", 0.18);
    tone(c, out, t + 0.33, 783.99, 0.75, "triangle", 0.2);
  },
  penalty: (c, out, t) => whistle(c, out, t, 0.55),
  red: (c, out, t) => {
    tone(c, out, t, 392, 0.22, "square", 0.12);
    tone(c, out, t + 0.24, 293.66, 0.38, "square", 0.12);
  },
  sub: (c, out, t) => {
    tone(c, out, t, 659.25, 0.11, "sine", 0.25);
    tone(c, out, t + 0.13, 880, 0.16, "sine", 0.25);
  },
  ht: (c, out, t) => {
    whistle(c, out, t, 0.3);
    whistle(c, out, t + 0.42, 0.65);
  },
  ft: (c, out, t) => {
    whistle(c, out, t, 0.28);
    whistle(c, out, t + 0.4, 0.28);
    whistle(c, out, t + 0.8, 0.9);
  },
};

/** Plays a sound if audio has been unlocked; silently does nothing otherwise. */
export function playSound(kind: SoundKind): boolean {
  const c = ctx;
  if (!c || c.state !== "running") return false;
  const master = c.createGain();
  master.gain.value = 0.7;
  master.connect(c.destination);
  PATTERNS[kind](c, master, c.currentTime + 0.03);
  return true;
}

/* ── Preferences (this browser only) ─────────────────────────────────────── */

export const SOUND_KEY = "eksu-match-sounds-v1";
export const SOUND_KINDS: { kind: SoundKind; label: string }[] = [
  { kind: "goal", label: "Goals" },
  { kind: "penalty", label: "Penalties awarded" },
  { kind: "red", label: "Red cards" },
  { kind: "sub", label: "Substitutions" },
  { kind: "ht", label: "Half-time" },
  { kind: "ft", label: "Full-time" },
];

export interface SoundPrefs {
  on: boolean;
  off: SoundKind[]; // kinds switched off individually
}

export function readSoundPrefs(): SoundPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null") as SoundPrefs | null;
    if (p && typeof p.on === "boolean" && Array.isArray(p.off)) return p;
  } catch {
    /* blocked or corrupt */
  }
  return { on: false, off: [] };
}

export function writeSoundPrefs(p: SoundPrefs) {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(p));
  } catch {
    /* private mode: preference lasts for this visit */
  }
}
