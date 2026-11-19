/**
 * Operator practice: the scripted mock match and how an attempt is marked.
 *
 * The practice match has two 5-minute halves. Cues appear as the console's
 * own match clock reaches them; the applicant records each one in the real
 * operator console. Marking compares the final event log with the script.
 * Pure and dependency-free: the server re-marks submissions with it.
 */
import type { OpEvent, OpEventType, OpMatchState, Side } from "../operator/types.ts";

export const PRACTICE_HALF_SECONDS = 300;

export type CueWhen =
  | { kind: "phase"; phase: "SCHEDULED" | "HALF_TIME" }
  | { kind: "clock"; second: number; period: 1 | 2 };

export interface Cue {
  id: string;
  when: CueWhen;
  /** What "happens" on the pitch (shown to the applicant). */
  text: string;
  /** How to record it in the console (shown under the cue). */
  how: string;
}

/** Football minute of a match-clock second (1-based). */
export const minuteAt = (second: number) => Math.floor(second / 60) + 1;

export const CUES: Cue[] = [
  { id: "kickoff", when: { kind: "phase", phase: "SCHEDULED" }, text: "The referee blows for kick-off.", how: "Press and hold KICK OFF to start the first half." },
  { id: "goal9", when: { kind: "clock", second: 40, period: 1 }, text: "GOAL! Blue No. 9 finishes into the bottom corner.", how: "Tap GOAL → Blue → shirt 9." },
  { id: "yellow4", when: { kind: "clock", second: 90, period: 1 }, text: "Yellow card: Red No. 4 for a late tackle.", how: "Tap CARD → Red → shirt 4 → Yellow." },
  { id: "correct", when: { kind: "clock", second: 130, period: 1 }, text: "The referee corrects the scorer: Blue's goal was scored by No. 10, not No. 9.", how: "Undo / correct the No. 9 goal, then record a GOAL for Blue No. 10." },
  { id: "sub", when: { kind: "clock", second: 190, period: 1 }, text: "Substitution, Blue: No. 7 goes off, No. 14 comes on.", how: "Tap SUB → Blue → off 7 → on 14." },
  { id: "halftime", when: { kind: "clock", second: 285, period: 1 }, text: "The referee blows for half-time.", how: "End the first half when the whistle goes." },
  { id: "second", when: { kind: "phase", phase: "HALF_TIME" }, text: "The teams are back out. The second half is about to start.", how: "Start the second half." },
  { id: "goal11", when: { kind: "clock", second: 330, period: 2 }, text: "GOAL! Red No. 11 heads in from a corner.", how: "Tap GOAL → Red → shirt 11." },
  { id: "penalty", when: { kind: "clock", second: 400, period: 2 }, text: "Penalty to Blue! No. 10 steps up… and SCORES.", how: "Tap PENALTY → Blue → shirt 10 → Scored." },
  { id: "second-yellow", when: { kind: "clock", second: 460, period: 2 }, text: "Red No. 4 is booked again: second yellow, he is sent off.", how: "Tap CARD → Red → shirt 4 → 2nd yellow." },
  { id: "fulltime", when: { kind: "clock", second: 585, period: 2 }, text: "Full-time whistle.", how: "End the match and confirm the final score." },
];

export const EXPECTED_SCORE = { home: 2, away: 1 };

/** Cues that have "happened" for this state and match-clock second. */
export function visibleCues(state: OpMatchState, clockSecond: number): Cue[] {
  const after1 = ["HALF_TIME", "SECOND_HALF", "FULL_TIME"].includes(state.phase);
  return CUES.filter((c) => {
    if (c.when.kind === "phase") return c.when.phase === "SCHEDULED" || after1;
    if (c.when.period === 1) return after1 || (state.phase === "FIRST_HALF" && clockSecond >= c.when.second);
    return state.phase === "FULL_TIME" || (state.phase === "SECOND_HALF" && clockSecond >= c.when.second);
  });
}

export interface MarkItem {
  id: string;
  label: string;
  points: number;
  max: number;
  note?: string;
}

export interface PracticeMark {
  score: number;
  items: MarkItem[];
  finalScore: { home: number; away: number } | null;
  strayEvents: number;
  /** Average seconds from cue to recording, for matched events (null if none). */
  avgDelaySeconds: number | null;
}

type Want = { type: OpEventType | OpEventType[]; side: Side; shirt: number; shirtIn?: number; minute?: number };

const live = (e: OpEvent) => !e.voided;
const isType = (e: OpEvent, t: Want["type"]) => (Array.isArray(t) ? t.includes(e.type) : e.type === t);
const goalTypes: OpEventType[] = ["GOAL", "PENALTY_GOAL", "OWN_GOAL"];

function score(events: OpEvent[]) {
  const s = { home: 0, away: 0 };
  for (const e of events.filter(live)) {
    if (!goalTypes.includes(e.type)) continue;
    const side = e.type === "OWN_GOAL" ? (e.side === "home" ? "away" : "home") : e.side;
    s[side]++;
  }
  return s;
}

/**
 * Mark a finished (or abandoned) attempt. Each scripted event is matched to
 * at most one recorded event; anything recorded and not matched is a stray.
 */
export function markPractice(state: OpMatchState): PracticeMark {
  const events = state.events;
  const used = new Set<string>();
  const items: MarkItem[] = [];
  const delays: number[] = [];
  const logHas = (kind: string, detail?: string) => state.log.some((l) => l.kind === kind && (detail === undefined || l.detail === detail));

  const take = (want: Want, opts: { allowVoided?: boolean } = {}) => {
    const pool = events.filter((e) => !used.has(e.id) && (opts.allowVoided || live(e)) && e.side === want.side);
    const exact = pool.find((e) => isType(e, want.type) && e.shirt === want.shirt && (want.shirtIn === undefined || e.shirtIn === want.shirtIn));
    if (exact) {
      used.add(exact.id);
      return { e: exact, exact: true };
    }
    const typeOnly = pool.find((e) => isType(e, want.type));
    if (typeOnly) {
      used.add(typeOnly.id);
      return { e: typeOnly, exact: false };
    }
    return null;
  };
  const timing = (e: OpEvent, minute: number | undefined, full: number) => {
    if (minute === undefined) return { pts: full };
    const off = Math.abs(e.minute - minute) > 1;
    return off ? { pts: Math.round(full * 0.75), note: `recorded at ${e.minute}', expected around ${minute}'` } : { pts: full };
  };
  const eventItem = (id: string, label: string, max: number, want: Want, alt?: { type: OpEventType; points: number; note: string }) => {
    const hit = take(want);
    if (!hit) {
      if (alt) {
        const a = take({ ...want, type: alt.type });
        if (a) {
          items.push({ id, label, points: alt.points, max, note: alt.note });
          return;
        }
      }
      items.push({ id, label, points: 0, max, note: "not recorded" });
      return;
    }
    const base = hit.exact ? max : Math.round(max / 2);
    const t = timing(hit.e, want.minute, base);
    items.push({ id, label, points: t.pts, max, note: [hit.exact ? null : "wrong player", t.note].filter(Boolean).join("; ") || undefined });
  };

  items.push({ id: "kickoff", label: "Started the match", points: logHas("MATCH_STARTED") ? 5 : 0, max: 5 });

  // The scorer correction: No. 9 goal recorded, then voided, and a No. 10 goal in its place.
  {
    const nine = events.find((e) => e.type === "GOAL" && e.side === "home" && e.shirt === 9);
    if (nine) used.add(nine.id);
    const ten = events.find((e) => live(e) && e.type === "GOAL" && e.side === "home" && e.shirt === 10 && !used.has(e.id));
    if (ten) used.add(ten.id);
    let pts = 0;
    const notes: string[] = [];
    if (nine) pts += 3;
    else notes.push("first goal (No. 9) not recorded");
    if (nine?.voided) pts += 3;
    else if (nine) notes.push("wrong scorer not corrected");
    if (ten) pts += 4;
    else notes.push("No. 10 goal missing");
    items.push({ id: "goal-correction", label: "First goal and the scorer correction", points: pts, max: 10, note: notes.join("; ") || undefined });
  }

  eventItem("yellow4", "Yellow card, Red No. 4", 10, { type: "YELLOW_CARD", side: "away", shirt: 4, minute: minuteAt(90) });
  eventItem("sub", "Substitution, Blue 7 → 14", 10, { type: "SUBSTITUTION", side: "home", shirt: 7, shirtIn: 14, minute: minuteAt(190) });
  items.push({ id: "halftime", label: "Ended the first half", points: logHas("PERIOD_ENDED") ? 5 : 0, max: 5 });
  items.push({ id: "second", label: "Started the second half", points: logHas("PERIOD_STARTED", "2H") ? 5 : 0, max: 5 });
  eventItem("goal11", "Goal, Red No. 11", 10, { type: "GOAL", side: "away", shirt: 11, minute: minuteAt(330) });
  eventItem("penalty", "Penalty scored, Blue No. 10", 10, { type: "PENALTY_GOAL", side: "home", shirt: 10, minute: minuteAt(400) }, {
    type: "GOAL",
    points: 5,
    note: "recorded as an ordinary goal, not a penalty",
  });
  eventItem("second-yellow", "Second yellow, Red No. 4", 10, { type: "SECOND_YELLOW", side: "away", shirt: 4, minute: minuteAt(460) }, {
    type: "RED_CARD",
    points: 5,
    note: "recorded as a straight red, not a second yellow",
  });
  items.push({ id: "fulltime", label: "Ended the match", points: state.phase === "FULL_TIME" ? 5 : 0, max: 5 });

  const final = score(events);
  const scoreRight = final.home === EXPECTED_SCORE.home && final.away === EXPECTED_SCORE.away;
  items.push({
    id: "final-score",
    label: "Final score 2–1",
    points: scoreRight ? 10 : 0,
    max: 10,
    note: scoreRight ? undefined : `recorded ${final.home}–${final.away}`,
  });

  const strays = events.filter((e) => live(e) && !used.has(e.id));
  items.push({
    id: "clean",
    label: "No extra or duplicate events",
    points: Math.max(0, 10 - 5 * strays.length),
    max: 10,
    note: strays.length ? `${strays.length} extra event${strays.length === 1 ? "" : "s"} left in the record` : undefined,
  });

  // Reaction time: wall time from cue to recording, for the scripted events.
  const p1 = state.log.find((l) => l.kind === "MATCH_STARTED")?.at;
  const p2 = state.log.find((l) => l.kind === "PERIOD_STARTED" && l.detail === "2H")?.at;
  const cueAt = (second: number) => (second < PRACTICE_HALF_SECONDS ? (p1 ? p1 + second * 1000 : null) : p2 ? p2 + (second - PRACTICE_HALF_SECONDS) * 1000 : null);
  const pairs: [number, OpEvent | undefined][] = [
    [90, events.find((e) => e.type === "YELLOW_CARD" && e.side === "away" && e.shirt === 4)],
    [190, events.find((e) => e.type === "SUBSTITUTION" && e.side === "home")],
    [330, events.find((e) => e.type === "GOAL" && e.side === "away")],
    [400, events.find((e) => e.type === "PENALTY_GOAL" && e.side === "home")],
    [460, events.find((e) => (e.type === "SECOND_YELLOW" || e.type === "RED_CARD") && e.side === "away")],
  ];
  for (const [sec, e] of pairs) {
    const at = cueAt(sec);
    if (e && at) delays.push(Math.max(0, (e.recordedAt - at) / 1000));
  }
  const realDelays = delays.filter((d) => Number.isFinite(d));

  return {
    score: items.reduce((s, i) => s + i.points, 0),
    items,
    finalScore: final,
    strayEvents: strays.length,
    avgDelaySeconds: realDelays.length ? Math.round(realDelays.reduce((a, b) => a + b, 0) / realDelays.length) : null,
  };
}
