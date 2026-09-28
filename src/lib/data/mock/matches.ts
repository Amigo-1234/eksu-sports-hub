/**
 * DEMO DATA — development only.
 *
 * Fixtures are declared relative to a reference "now" so the demo always has
 * matches that are live, later today, upcoming and recently finished.
 * Scores are derived from the goal events, so the two can never disagree.
 */
import { toMatchStatus, type MatchDisposition, type MatchPhase } from "../../status";
import type { ID, Match, MatchEvent, MatchEventType, PlayerRef, Score } from "../../types";
import { dateKey } from "../../format";

type Side = "H" | "A";
/** Minute as number, or "45+2" for stoppage time. */
type Minute = number | `${number}+${number}`;

interface EventSpec {
  type: MatchEventType;
  side: Side;
  minute: Minute;
  player: number;
  playerIn?: number;
}

const ev =
  (type: MatchEventType) =>
  (side: Side, minute: Minute, player: number): EventSpec => ({ type, side, minute, player });

const goal = ev("GOAL");
const pen = ev("PENALTY_GOAL");
const penMiss = ev("PENALTY_MISS");
/** `side` is the team of the player who put it into their own net. */
const og = ev("OWN_GOAL");
const yc = ev("YELLOW_CARD");
const rc = ev("RED_CARD");
const sub = (side: Side, minute: Minute, off: number, on: number): EventSpec => ({
  type: "SUBSTITUTION",
  side,
  minute,
  player: off,
  playerIn: on,
});

/** When a fixture happens, relative to the reference time. */
type When =
  /** Whole days from today (campus time) at a fixed "HH:MM" kick-off. */
  | { day: number; time: string }
  /** Minutes from now; rounded to a quarter hour. */
  | { inMinutes: number }
  /** Currently in progress. `minute` is ignored at half-time. */
  | { live: "1H" | "HT" | "2H"; minute?: number };

interface FixtureSpec {
  id: ID;
  competitionId: ID;
  round: string;
  home: ID;
  away: ID;
  venue: ID;
  when: When;
  /** Completed (or, for abandoned, stopped) — omit for not-yet-played. */
  played?: boolean;
  events?: EventSpec[];
  disposition?: Exclude<MatchDisposition, "NORMAL">;
  statusNote?: string;
  abandonedMinute?: number;
}

const MIN = 60_000;

/* ------------------------------------------------------------------------ */
/* Fixture list                                                              */
/* ------------------------------------------------------------------------ */

const IFC = "ifc-2026";
const IFW = "ifw-2026";
const IDC = "idc-2026";
const MAIN = "v-main";
const P2 = "v-pitch2";
const EDUF = "v-edu";

const fixtures: FixtureSpec[] = [
  // ── Inter-Faculty Championship ──────────────────────────────────────────
  // Matchday 1
  { id: "ifc-md1-sci-agr", competitionId: IFC, round: "Matchday 1", home: "fac-sci", away: "fac-agr", venue: MAIN, when: { day: -24, time: "14:00" }, played: true,
    events: [goal("H", 18, 9), yc("A", 40, 5), goal("H", 71, 11)] },
  { id: "ifc-md1-eng-mgt", competitionId: IFC, round: "Matchday 1", home: "fac-eng", away: "fac-mgt", venue: P2, when: { day: -24, time: "14:00" }, played: true,
    events: [goal("A", 33, 7), goal("H", 82, 10)] },
  { id: "ifc-md1-law-ssc", competitionId: IFC, round: "Matchday 1", home: "fac-law", away: "fac-ssc", venue: MAIN, when: { day: -24, time: "16:30" }, played: true,
    events: [yc("H", 22, 4), goal("A", 64, 9)] },
  { id: "ifc-md1-art-edu", competitionId: IFC, round: "Matchday 1", home: "fac-art", away: "fac-edu", venue: P2, when: { day: -24, time: "16:30" }, played: true,
    events: [
      goal("H", 12, 10), goal("A", 27, 9), og("A", 39, 3), yc("A", 44, 6),
      sub("A", 46, 6, 14), goal("A", 58, 14), rc("H", 67, 5), sub("H", 70, 11, 17),
      goal("A", 81, 9),
    ] },
  // Matchday 2
  { id: "ifc-md2-agr-edu", competitionId: IFC, round: "Matchday 2", home: "fac-agr", away: "fac-edu", venue: MAIN, when: { day: -17, time: "14:00" }, played: true,
    events: [goal("A", 29, 9), goal("H", "45+1", 8)] },
  { id: "ifc-md2-ssc-art", competitionId: IFC, round: "Matchday 2", home: "fac-ssc", away: "fac-art", venue: P2, when: { day: -17, time: "14:00" }, played: true,
    events: [goal("H", 51, 9), pen("H", 77, 10)] },
  { id: "ifc-md2-mgt-law", competitionId: IFC, round: "Matchday 2", home: "fac-mgt", away: "fac-law", venue: MAIN, when: { day: -17, time: "16:30" }, played: true,
    events: [goal("A", 14, 11), yc("H", 36, 2), goal("A", 88, 19)] },
  { id: "ifc-md2-sci-eng", competitionId: IFC, round: "Matchday 2", home: "fac-sci", away: "fac-eng", venue: EDUF, when: { day: -17, time: "16:30" }, played: true,
    events: [yc("A", 31, 4), goal("H", 62, 9), yc("H", 85, 8)] },
  // Matchday 3
  { id: "ifc-md3-eng-agr", competitionId: IFC, round: "Matchday 3", home: "fac-eng", away: "fac-agr", venue: MAIN, when: { day: -10, time: "14:00" }, played: true,
    events: [goal("H", 8, 10), goal("H", 35, 9), goal("A", 60, 8), goal("H", 79, 7)] },
  { id: "ifc-md3-law-sci", competitionId: IFC, round: "Matchday 3", home: "fac-law", away: "fac-sci", venue: P2, when: { day: -10, time: "14:00" }, played: true,
    events: [goal("A", 23, 11), pen("H", 70, 9)] },
  { id: "ifc-md3-art-mgt", competitionId: IFC, round: "Matchday 3", home: "fac-art", away: "fac-mgt", venue: MAIN, when: { day: -10, time: "16:30" }, played: true,
    events: [goal("H", 55, 10)] },
  { id: "ifc-md3-edu-ssc", competitionId: IFC, round: "Matchday 3", home: "fac-edu", away: "fac-ssc", venue: EDUF, when: { day: -10, time: "16:30" }, played: true,
    disposition: "ABANDONED", abandonedMinute: 58,
    statusNote: "Abandoned in the 58th minute due to a heavy rainstorm. Replay date to be confirmed by the organising committee.",
    events: [goal("A", 17, 9), yc("H", 30, 4), goal("H", 49, 9)] },
  // Matchday 4
  { id: "ifc-md4-agr-ssc", competitionId: IFC, round: "Matchday 4", home: "fac-agr", away: "fac-ssc", venue: MAIN, when: { day: -3, time: "14:00" }, played: true,
    events: [goal("A", 40, 9), yc("H", 52, 5), goal("A", 66, 7)] },
  { id: "ifc-md4-mgt-edu", competitionId: IFC, round: "Matchday 4", home: "fac-mgt", away: "fac-edu", venue: P2, when: { day: -3, time: "14:00" },
    disposition: "POSTPONED", statusNote: "Postponed due to a waterlogged pitch. New date to be announced." },
  { id: "ifc-md4-sci-art", competitionId: IFC, round: "Matchday 4", home: "fac-sci", away: "fac-art", venue: MAIN, when: { day: -3, time: "16:30" }, played: true,
    events: [
      goal("H", 6, 9), pen("H", 21, 10), goal("A", 38, 9), yc("A", 39, 4),
      sub("H", 60, 7, 15), goal("H", 74, 15), sub("A", 75, 11, 18), goal("H", "90+3", 9),
    ] },
  { id: "ifc-md4-eng-law", competitionId: IFC, round: "Matchday 4", home: "fac-eng", away: "fac-law", venue: EDUF, when: { day: -3, time: "16:30" }, played: true,
    events: [
      goal("H", 11, 9), goal("A", 34, 11), penMiss("H", 52, 10), yc("A", 53, 3),
      goal("A", 68, 19), sub("H", 70, 8, 16), goal("H", 86, 16),
    ] },
  // Matchday 5 — today
  { id: "ifc-md5-law-agr", competitionId: IFC, round: "Matchday 5", home: "fac-law", away: "fac-agr", venue: MAIN, when: { inMinutes: -200 }, played: true,
    events: [goal("H", 15, 11), yc("A", 28, 6), goal("A", 44, 8), sub("H", 62, 7, 14), goal("H", 77, 14)] },
  { id: "ifc-md5-art-eng", competitionId: IFC, round: "Matchday 5", home: "fac-art", away: "fac-eng", venue: P2, when: { live: "2H", minute: 67 },
    events: [
      goal("A", 9, 9), yc("H", 24, 6), pen("H", 38, 10), yc("A", "45+1", 4),
      sub("A", 46, 11, 17), goal("A", 59, 17),
    ] },
  { id: "ifc-md5-edu-sci", competitionId: IFC, round: "Matchday 5", home: "fac-edu", away: "fac-sci", venue: MAIN, when: { live: "HT" },
    events: [yc("H", 19, 5), goal("A", 33, 9)] },
  { id: "ifc-md5-ssc-mgt", competitionId: IFC, round: "Matchday 5", home: "fac-ssc", away: "fac-mgt", venue: EDUF, when: { inMinutes: 110 } },
  // Matchday 6
  { id: "ifc-md6-agr-mgt", competitionId: IFC, round: "Matchday 6", home: "fac-agr", away: "fac-mgt", venue: MAIN, when: { day: 4, time: "14:00" } },
  { id: "ifc-md6-sci-ssc", competitionId: IFC, round: "Matchday 6", home: "fac-sci", away: "fac-ssc", venue: P2, when: { day: 4, time: "14:00" } },
  { id: "ifc-md6-eng-edu", competitionId: IFC, round: "Matchday 6", home: "fac-eng", away: "fac-edu", venue: MAIN, when: { day: 4, time: "16:30" } },
  { id: "ifc-md6-law-art", competitionId: IFC, round: "Matchday 6", home: "fac-law", away: "fac-art", venue: EDUF, when: { day: 4, time: "16:30" } },
  // Matchday 7
  { id: "ifc-md7-art-agr", competitionId: IFC, round: "Matchday 7", home: "fac-art", away: "fac-agr", venue: MAIN, when: { day: 11, time: "14:00" } },
  { id: "ifc-md7-edu-law", competitionId: IFC, round: "Matchday 7", home: "fac-edu", away: "fac-law", venue: P2, when: { day: 11, time: "14:00" } },
  { id: "ifc-md7-ssc-eng", competitionId: IFC, round: "Matchday 7", home: "fac-ssc", away: "fac-eng", venue: MAIN, when: { day: 11, time: "16:30" } },
  { id: "ifc-md7-mgt-sci", competitionId: IFC, round: "Matchday 7", home: "fac-mgt", away: "fac-sci", venue: EDUF, when: { day: 11, time: "16:30" } },

  // ── Women's Inter-Faculty Championship ──────────────────────────────────
  { id: "ifw-md1-sci-mgt", competitionId: IFW, round: "Matchday 1", home: "fac-sci-w", away: "fac-mgt-w", venue: EDUF, when: { day: -20, time: "10:00" }, played: true,
    events: [goal("H", 20, 9), goal("H", 47, 10), goal("H", 83, 7)] },
  { id: "ifw-md1-edu-ssc", competitionId: IFW, round: "Matchday 1", home: "fac-edu-w", away: "fac-ssc-w", venue: EDUF, when: { day: -20, time: "12:00" }, played: true,
    events: [goal("A", 31, 11), goal("H", 72, 9)] },
  { id: "ifw-md2-mgt-ssc", competitionId: IFW, round: "Matchday 2", home: "fac-mgt-w", away: "fac-ssc-w", venue: P2, when: { day: -13, time: "10:00" }, played: true,
    events: [goal("A", 12, 11), yc("H", 50, 4), goal("A", 63, 8)] },
  { id: "ifw-md2-sci-edu", competitionId: IFW, round: "Matchday 2", home: "fac-sci-w", away: "fac-edu-w", venue: P2, when: { day: -13, time: "12:00" }, played: true,
    events: [goal("H", 25, 9), goal("A", 58, 9), goal("A", 90, 7)] },
  { id: "ifw-md3-edu-mgt", competitionId: IFW, round: "Matchday 3", home: "fac-edu-w", away: "fac-mgt-w", venue: EDUF, when: { day: -6, time: "10:00" }, played: true,
    events: [goal("H", 44, 9), goal("H", 61, 10)] },
  { id: "ifw-md3-ssc-sci", competitionId: IFW, round: "Matchday 3", home: "fac-ssc-w", away: "fac-sci-w", venue: EDUF, when: { day: -6, time: "12:00" },
    disposition: "CANCELLED", statusNote: "Cancelled by the organising committee. This fixture will not be replayed." },
  { id: "ifw-md4-ssc-edu", competitionId: IFW, round: "Matchday 4", home: "fac-ssc-w", away: "fac-edu-w", venue: P2, when: { live: "1H", minute: 23 },
    events: [yc("A", 11, 5), goal("H", 19, 11)] },
  { id: "ifw-md4-mgt-sci", competitionId: IFW, round: "Matchday 4", home: "fac-mgt-w", away: "fac-sci-w", venue: P2, when: { inMinutes: 170 } },
  { id: "ifw-md5-ssc-mgt", competitionId: IFW, round: "Matchday 5", home: "fac-ssc-w", away: "fac-mgt-w", venue: EDUF, when: { day: 6, time: "10:00" } },
  { id: "ifw-md5-edu-sci", competitionId: IFW, round: "Matchday 5", home: "fac-edu-w", away: "fac-sci-w", venue: EDUF, when: { day: 6, time: "12:00" } },
  { id: "ifw-md6-mgt-edu", competitionId: IFW, round: "Matchday 6", home: "fac-mgt-w", away: "fac-edu-w", venue: P2, when: { day: 13, time: "10:00" } },
  { id: "ifw-md6-sci-ssc", competitionId: IFW, round: "Matchday 6", home: "fac-sci-w", away: "fac-ssc-w", venue: P2, when: { day: 13, time: "12:00" } },

  // ── Inter-Departmental Cup ──────────────────────────────────────────────
  { id: "idc-qf1-csc-mcb", competitionId: IDC, round: "Quarter-final", home: "dep-csc", away: "dep-mcb", venue: P2, when: { day: -12, time: "15:00" }, played: true,
    events: [goal("H", 22, 9), goal("A", 50, 10), goal("H", 76, 11)] },
  { id: "idc-qf2-mee-acc", competitionId: IDC, round: "Quarter-final", home: "dep-mee", away: "dep-acc", venue: MAIN, when: { day: -12, time: "17:00" }, played: true,
    events: [yc("H", 41, 3), goal("A", 69, 9)] },
  { id: "idc-qf3-mac-eco", competitionId: IDC, round: "Quarter-final", home: "dep-mac", away: "dep-eco", venue: P2, when: { day: -11, time: "15:00" }, played: true,
    events: [goal("H", 30, 7), rc("A", 55, 4), goal("H", 80, 9)] },
  { id: "idc-qf4-pol-tma", competitionId: IDC, round: "Quarter-final", home: "dep-pol", away: "dep-tma", venue: MAIN, when: { day: -11, time: "17:00" }, played: true,
    events: [goal("A", 5, 9), goal("H", 38, 10), goal("A", 84, 11)] },
  { id: "idc-sf1-csc-acc", competitionId: IDC, round: "Semi-final", home: "dep-csc", away: "dep-acc", venue: MAIN, when: { day: -1, time: "16:00" }, played: true,
    events: [yc("A", 27, 5), sub("H", 60, 7, 15), goal("H", 73, 15), yc("H", 88, 4)] },
  { id: "idc-sf2-mac-tma", competitionId: IDC, round: "Semi-final", home: "dep-mac", away: "dep-tma", venue: MAIN, when: { day: 2, time: "16:00" } },
];

/* ------------------------------------------------------------------------ */
/* Resolution against a reference time                                       */
/* ------------------------------------------------------------------------ */

const QUARTER_HOUR = 15 * MIN;
const FIVE_MIN = 5 * MIN;
/** Scheduled kick-offs sit on a 5-minute mark, as a real fixture list would. */
const roundKickoff = (t: number) => Math.round(t / FIVE_MIN) * FIVE_MIN;
const HALF = 45 * MIN;
const BREAK = 15 * MIN;

function atCampusTime(anchor: number, dayOffset: number, time: string): number {
  const key = dateKey(anchor + dayOffset * 86_400_000);
  // WAT is UTC+1 all year (no daylight saving).
  return Date.parse(`${key}T${time}:00+01:00`);
}

function parseMinute(m: Minute): { minute: number; addedTime?: number } {
  if (typeof m === "number") return { minute: m };
  const [base, added] = m.split("+").map(Number);
  return { minute: base, addedTime: added };
}

function resolveTiming(when: When, anchor: number) {
  if ("day" in when) {
    return { kickoff: atCampusTime(anchor, when.day, when.time), phase: null, periodStart: null };
  }
  if ("inMinutes" in when) {
    const t = anchor + when.inMinutes * MIN;
    return { kickoff: Math.round(t / QUARTER_HOUR) * QUARTER_HOUR, phase: null, periodStart: null };
  }
  const minute = when.minute ?? 45;
  if (when.live === "1H") {
    const periodStart = anchor - (minute - 1) * MIN - MIN / 2;
    return { kickoff: roundKickoff(periodStart), phase: "1H" as const, periodStart };
  }
  if (when.live === "HT") {
    return { kickoff: roundKickoff(anchor - HALF - 5 * MIN), phase: "HT" as const, periodStart: null };
  }
  const periodStart = anchor - (minute - 46) * MIN - MIN / 2;
  return { kickoff: roundKickoff(periodStart - HALF - BREAK), phase: "2H" as const, periodStart };
}

function toPlayer(n: number): PlayerRef {
  return { shirtNumber: n };
}

function minuteSortKey(e: { minute: number; addedTime?: number }) {
  return e.minute * 100 + (e.addedTime ?? 0);
}

export interface MockMatchData {
  matches: Match[];
  events: Map<ID, MatchEvent[]>;
}

export function buildMatches(anchor: number): MockMatchData {
  const matches: Match[] = [];
  const events = new Map<ID, MatchEvent[]>();

  for (const f of fixtures) {
    const { kickoff, phase, periodStart } = resolveTiming(f.when, anchor);

    const resolved: MatchEvent[] = (f.events ?? [])
      .map((e, i) => ({
        id: `${f.id}-e${i + 1}`,
        matchId: f.id,
        type: e.type,
        teamId: e.side === "H" ? f.home : f.away,
        ...parseMinute(e.minute),
        player: toPlayer(e.player),
        ...(e.playerIn !== undefined ? { playerIn: toPlayer(e.playerIn) } : {}),
      }))
      .sort((a, b) => minuteSortKey(a) - minuteSortKey(b));

    const started = f.played || phase !== null;
    let score: Score | null = null;
    if (started) {
      score = { home: 0, away: 0 };
      for (const e of resolved) {
        const forHome =
          (e.type === "GOAL" || e.type === "PENALTY_GOAL") ? e.teamId === f.home
          : e.type === "OWN_GOAL" ? e.teamId === f.away
          : null;
        if (forHome === true) score.home++;
        if (forHome === false) score.away++;
      }
    }

    const matchPhase: MatchPhase = phase ?? (f.played ? "FT" : "PRE");

    matches.push({
      id: f.id,
      competitionId: f.competitionId,
      homeTeamId: f.home,
      awayTeamId: f.away,
      venueId: f.venue,
      kickoffAt: new Date(kickoff).toISOString(),
      status: toMatchStatus(matchPhase, f.disposition),
      score,
      round: f.round,
      periodStartedAt: periodStart !== null ? new Date(periodStart).toISOString() : null,
      ...(f.statusNote ? { statusNote: f.statusNote } : {}),
      ...(f.abandonedMinute ? { abandonedMinute: f.abandonedMinute } : {}),
    });
    events.set(f.id, resolved);
  }

  return { matches, events };
}
