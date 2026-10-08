/**
 * Special competition rules — an isolated, per-competition module.
 *
 * A competition without `special_rules` (every normal competition) plays
 * normal football and nothing here applies. The database is authoritative
 * (supabase/migrations/*_special_rules.sql); this module parses the settings
 * for display and mirrors the checks in the operator console.
 *
 * Remove later: clear the competition's special rules (played matches keep
 * the rules they were played under), then delete this module's call sites.
 */

/** Behavioural settings (snapshotted onto a match at kick-off). */
export interface SpecialRules {
  /** Exact number of starters (6 = six-a-side). */
  starters?: number;
  /** No stoppage time: the clock stops at the regulation end of each half. */
  noAddedTime?: boolean;
  /** Length of the half-time break (display only; the operator restarts play). */
  halftimeSeconds?: number;
  /** Unlimited substitutions; substituted players may return. */
  rollingSubs?: boolean;
  /** A red card / second yellow is a temporary suspension of this many seconds of active play. */
  redCardSuspensionSeconds?: number;
  /** Display only. */
  offside?: boolean;
}

export interface Regulation {
  title: string;
  body: string;
}

/** Public Rules & Regulations text of a competition. */
export interface RegulationsText {
  title: string;
  summary: string | null;
  items: Regulation[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

/** Settings from the database's snake_case jsonb (null: normal football). */
export function parseSpecialRules(raw: unknown): SpecialRules | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: SpecialRules = {};
  const starters = num(r.starters);
  if (starters !== undefined) out.starters = starters;
  const noAdded = bool(r.no_added_time);
  if (noAdded !== undefined) out.noAddedTime = noAdded;
  const ht = num(r.halftime_seconds);
  if (ht !== undefined) out.halftimeSeconds = ht;
  const rolling = bool(r.rolling_subs);
  if (rolling !== undefined) out.rollingSubs = rolling;
  const susp = num(r.red_card_suspension_seconds);
  if (susp !== undefined) out.redCardSuspensionSeconds = susp;
  const offside = bool(r.offside);
  if (offside !== undefined) out.offside = offside;
  return Object.keys(out).length ? out : null;
}

export function parseRegulations(raw: unknown): RegulationsText | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.regulations)
    ? r.regulations.filter(
        (x): x is Regulation => !!x && typeof x === "object" && typeof (x as Regulation).title === "string" && typeof (x as Regulation).body === "string",
      )
    : [];
  if (!items.length) return null;
  return {
    title: typeof r.title === "string" && r.title.trim() ? r.title : "Rules & Regulations",
    summary: typeof r.summary === "string" && r.summary.trim() ? r.summary : null,
    items,
  };
}

/** Rolling substitutions / temporary red cards change who is on the pitch. */
export const hasPlayerRules = (r: SpecialRules | null | undefined): boolean =>
  !!r && (!!r.rollingSubs || r.redCardSuspensionSeconds != null);

export const suspensionSeconds = (r: SpecialRules | null | undefined): number | null => r?.redCardSuspensionSeconds ?? null;

/** Short facts for badges, e.g. ["6-a-side", "No added time", "Rolling subs", "60 s red-card suspension"]. */
export function ruleFacts(r: SpecialRules | null | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.starters) out.push(`${r.starters}-a-side`);
  if (r.noAddedTime) out.push("No added time");
  if (r.rollingSubs) out.push("Rolling subs");
  if (r.redCardSuspensionSeconds) out.push(`${r.redCardSuspensionSeconds} s red-card suspension`);
  if (r.offside === false) out.push("No offside");
  return out;
}

/** "0:42" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds left of a half-time break (null when the competition sets none or the break is unknown). */
export function halftimeRemaining(r: SpecialRules | null | undefined, breakStartedAt: number | null, now: number): number | null {
  if (!r?.halftimeSeconds || breakStartedAt === null) return null;
  return Math.max(0, r.halftimeSeconds - (now - breakStartedAt) / 1000);
}

/**
 * Six-a-side novelty preset (MARKAZUL GINAA NOVELTY MATCH official rules).
 * Applied by an admin from the competition page; stored as the competition's
 * `special_rules`. Match length (2 × 8:00) is the separate match-length setting.
 */
export const SIX_A_SIDE_NOVELTY_PRESET = {
  starters: 6,
  no_added_time: true,
  halftime_seconds: 60,
  rolling_subs: true,
  red_card_suspension_seconds: 60,
  offside: false,
  title: "Rules & Regulations",
  summary: "Official regulations of this six-a-side novelty event. Its rules differ from conventional football.",
  regulations: [
    { title: "Match duration", body: "Two halves of 8 minutes each — 16 minutes of playing time in total." },
    { title: "Half-time", body: "A one-minute break. The referee decides when play resumes." },
    { title: "Added time", body: "No added time. Each half ends at the regulation time, on the referee's whistle." },
    { title: "Substitutions", body: "Unlimited rolling substitutions. A substituted player may return to the pitch." },
    {
      title: "Red cards",
      body:
        "A red card (including a second yellow) is a 60-second temporary suspension of active playing time; half-time and stoppages do not count. " +
        "The player may return once it has been served, with the referee's approval. For serious or repeated misconduct the referee may exclude a player for the rest of the match.",
    },
    { title: "Offside", body: "There is no offside." },
    {
      title: "Competition format",
      body: "Four teams in one league table. Every team plays every other team once: six matches, no return legs and no knockout.",
    },
    { title: "Standings", body: "Three points for a win, one for a draw, none for a loss. Goal difference is the first tie-breaker after points." },
    {
      title: "Awards",
      body: "Gold medals for first place and silver medals for second place. Certificates for Best Player, Top Scorer, Best Goalkeeper and Best Defender.",
    },
    { title: "Equipment", body: "No studded boots. Players must bring their own jersey, football socks and canvas boots." },
    { title: "Discipline", body: "Abusive language and disrespectful conduct are prohibited. The referee's decisions are final." },
  ],
} as const;
