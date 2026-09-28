/**
 * The single source of truth for what can happen to a match, and when.
 *
 * Every command maps 1:1 to a future backend RPC. `allowedIn` + `guard` are
 * exactly the checks the RPC must enforce server-side; the UI derives its
 * buttons from `availableCommands()` and never checks phases on its own.
 */
import type { MatchStatus } from "../types.ts";
import type { OpMatchState, OpPhase } from "./types.ts";

export type OpCommand =
  | "START_MATCH"
  | "RECORD_EVENT"
  | "VOID_EVENT"
  | "END_PERIOD"
  | "START_PERIOD"
  | "SET_STOPPAGE"
  | "PAUSE"
  | "RESUME"
  | "FINALISE_MATCH"
  | "POSTPONE"
  | "CANCEL"
  | "ABANDON";

export type Consequence =
  /** Fast, reversible, single confirm at most. */
  | "routine"
  /** Changes match state; needs a deliberate hold/slide. */
  | "critical";

export type OpRole = "operator" | "admin";

interface CommandSpec {
  /** Name of the backend RPC that will implement this command. */
  rpc: string;
  role: OpRole;
  consequence: Consequence;
  allowedIn: readonly OpPhase[];
  /** Extra state checks beyond phase. Returns a reason when blocked. */
  guard?: (s: OpMatchState) => string | null;
  /** Phase after success, when the command changes it. */
  to?: OpPhase;
}

const IN_PLAY = ["FIRST_HALF", "SECOND_HALF"] as const;
const STARTED = ["FIRST_HALF", "HALF_TIME", "SECOND_HALF"] as const;

export const COMMANDS: Record<OpCommand, CommandSpec> = {
  START_MATCH: { rpc: "start_match", role: "operator", consequence: "critical", allowedIn: ["SCHEDULED"], to: "FIRST_HALF" },
  RECORD_EVENT: { rpc: "record_event", role: "operator", consequence: "routine", allowedIn: IN_PLAY },
  VOID_EVENT: { rpc: "void_event", role: "operator", consequence: "routine", allowedIn: STARTED },
  END_PERIOD: { rpc: "end_period", role: "operator", consequence: "critical", allowedIn: ["FIRST_HALF"], to: "HALF_TIME" },
  START_PERIOD: { rpc: "start_period", role: "operator", consequence: "critical", allowedIn: ["HALF_TIME"], to: "SECOND_HALF" },
  SET_STOPPAGE: { rpc: "set_stoppage", role: "operator", consequence: "routine", allowedIn: IN_PLAY },
  PAUSE: {
    rpc: "pause_match",
    role: "operator",
    consequence: "routine",
    allowedIn: IN_PLAY,
    guard: (s) => (s.clock.pausedAt !== null ? "Clock is already paused" : null),
  },
  RESUME: {
    rpc: "resume_match",
    role: "operator",
    consequence: "routine",
    allowedIn: IN_PLAY,
    guard: (s) => (s.clock.pausedAt === null ? "Clock is not paused" : null),
  },
  FINALISE_MATCH: { rpc: "finalise_match", role: "operator", consequence: "critical", allowedIn: ["SECOND_HALF"], to: "FULL_TIME" },
  // Administrative outcomes: represented now, not offered to operators.
  POSTPONE: { rpc: "postpone_match", role: "admin", consequence: "critical", allowedIn: ["SCHEDULED"], to: "POSTPONED" },
  CANCEL: { rpc: "cancel_match", role: "admin", consequence: "critical", allowedIn: ["SCHEDULED", "POSTPONED"], to: "CANCELLED" },
  ABANDON: { rpc: "abandon_match", role: "admin", consequence: "critical", allowedIn: STARTED, to: "ABANDONED" },
};

export type Check = { ok: true } | { ok: false; reason: string };

export function canRun(state: OpMatchState, command: OpCommand, role: OpRole = "operator"): Check {
  const spec = COMMANDS[command];
  if (spec.role === "admin" && role !== "admin") return { ok: false, reason: "Only an administrator can do this" };
  if (!spec.allowedIn.includes(state.phase)) {
    return { ok: false, reason: `Not allowed while the match is ${PHASE_LABEL[state.phase].toLowerCase()}` };
  }
  const blocked = spec.guard?.(state);
  return blocked ? { ok: false, reason: blocked } : { ok: true };
}

export function availableCommands(state: OpMatchState, role: OpRole = "operator"): Set<OpCommand> {
  return new Set(
    (Object.keys(COMMANDS) as OpCommand[]).filter((c) => canRun(state, c, role).ok),
  );
}

/** The one period transition that makes sense right now, if any. */
export function nextPeriodCommand(state: OpMatchState): "START_MATCH" | "END_PERIOD" | "START_PERIOD" | "FINALISE_MATCH" | null {
  for (const c of ["START_MATCH", "END_PERIOD", "START_PERIOD", "FINALISE_MATCH"] as const) {
    if (canRun(state, c).ok) return c;
  }
  return null;
}

export const PHASE_LABEL: Record<OpPhase, string> = {
  SCHEDULED: "Not started",
  FIRST_HALF: "1st half",
  HALF_TIME: "Half-time",
  SECOND_HALF: "2nd half",
  FULL_TIME: "Full-time",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  ABANDONED: "Abandoned",
};

export function isLivePhase(p: OpPhase): boolean {
  return p === "FIRST_HALF" || p === "HALF_TIME" || p === "SECOND_HALF";
}

export function isTerminalPhase(p: OpPhase): boolean {
  return p === "FULL_TIME" || p === "CANCELLED" || p === "ABANDONED";
}

/** Operator phase → public status (what `/matches/[id]` will show). */
export function toPublicStatus(p: OpPhase): MatchStatus {
  switch (p) {
    case "SCHEDULED":
      return "SCHEDULED";
    case "FIRST_HALF":
      return "LIVE_FIRST_HALF";
    case "HALF_TIME":
      return "HALF_TIME";
    case "SECOND_HALF":
      return "LIVE_SECOND_HALF";
    case "FULL_TIME":
      return "FULL_TIME";
    default:
      return p;
  }
}

export function fromPublicStatus(s: MatchStatus): OpPhase {
  switch (s) {
    case "LIVE_FIRST_HALF":
      return "FIRST_HALF";
    case "LIVE_SECOND_HALF":
      return "SECOND_HALF";
    default:
      return s;
  }
}
