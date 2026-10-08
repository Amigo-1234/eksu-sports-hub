/**
 * Matchday line-ups: shared shapes and pure helpers used by the admin and
 * operator line-up editors, the operator console and the public pitch.
 *
 * The database is authoritative (eligibility, limits, locking, on-field
 * state); these helpers only give immediate feedback and render state.
 */

export type LineupRole = "STARTER" | "SUBSTITUTE";
export type LineupStatus = "DRAFT" | "CONFIRMED";
/** Screening outcome for this match. Operators only ever see CLEARED / INELIGIBLE. */
export type Eligibility =
  | "CLEARED"
  | "PENDING"
  | "REJECTED"
  | "SUSPENDED"
  | "NOT_SCREENED"
  | "NOT_IN_SQUAD"
  /** Also represents another team entered in this competition. */
  | "CONFLICT"
  | "INELIGIBLE";

export interface FormationSlot {
  position: string;
  /** 0 = left touchline … 100 = right (team attacking upwards). */
  x: number;
  /** 0 = opponent goal line … 100 = own goal line. */
  y: number;
}

export interface Formation {
  code: string;
  name: string;
  slots: FormationSlot[];
}

export interface LineupRules {
  min_starters: number;
  max_starters: number;
  max_substitutes: number;
}

/** "Starting XI" for eleven-a-side; "Starting six" etc. for small-sided competitions. */
export function startingLabel(maxStarters: number): string {
  const words: Record<number, string> = { 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" };
  return maxStarters === 11 ? "Starting XI" : `Starting ${words[maxStarters] ?? maxStarters}`;
}

export interface EditorSquadMember {
  player_id: string;
  name: string | null;
  shirt_number: number;
  position: "GK" | "DF" | "MF" | "FW" | null;
  captain: boolean;
  eligibility: Eligibility;
}

export interface EditorLineupPlayer {
  player_id: string;
  name: string | null;
  shirt_number: number;
  role: LineupRole;
  position: string | null;
  slot: number | null;
  x: number | null;
  y: number | null;
  captain: boolean;
  goalkeeper: boolean;
  eligibility: Eligibility;
  on_field?: boolean;
  subbed_on?: boolean;
  subbed_off?: boolean;
  sent_off?: boolean;
}

/** Shape returned by the `lineup_editor_state` RPC. */
export interface LineupEditorState {
  /** VIEWER: assigned operator not in control (e.g. BACKUP before a take-over) — read-only. */
  viewer_role: "ADMIN" | "OPERATOR" | "VIEWER";
  /** Operator currently in control of the match, if any. */
  in_control?: string | null;
  match: {
    id: string;
    status: string;
    scheduled_at: string;
    side: "home" | "away";
    competition: string;
    season_id: string;
    lineup_override: string | null;
  };
  team: { id: string; name: string; short_name: string; code: string; color_primary: string; color_secondary: string };
  editable: boolean;
  rules: LineupRules;
  formations: Formation[];
  lineup: {
    id: string;
    status: LineupStatus;
    formation: string | null;
    confirmed_at: string | null;
    confirmed_by: string | null;
    updated_at: string;
    problems: string[];
    confirm_problems: string[];
    players: EditorLineupPlayer[];
  } | null;
  squad: EditorSquadMember[];
}

export type LineupResult = { ok: true; state: LineupEditorState } | { ok: false; error: string };

/** Everything the editor needs to call the backend (admin: server actions; operator: browser RPC). */
export interface LineupActions {
  save: (formation: string | null, players: LineupPayloadEntry[]) => Promise<LineupResult>;
  confirm: () => Promise<LineupResult>;
  reopen: (reason: string) => Promise<LineupResult>;
  /** After kick-off, ADMIN only. */
  correct?: (formation: string | null, players: LineupPayloadEntry[], reason: string) => Promise<LineupResult>;
}

/** What the editor submits per selected player. */
export interface LineupPayloadEntry {
  player_id: string;
  role: LineupRole;
  slot: number | null;
  captain: boolean;
}

/** Editor working state: who is selected, where, and the armband. */
export interface LineupDraft {
  formation: string | null;
  /** player_id → selection. Starters carry a formation slot (or null = unplaced). */
  picks: Record<string, { role: LineupRole; slot: number | null }>;
  captain: string | null;
}

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  CLEARED: "Eligible",
  PENDING: "Screening pending",
  REJECTED: "Failed screening",
  SUSPENDED: "Suspended",
  NOT_SCREENED: "Not screened",
  NOT_IN_SQUAD: "Not in squad",
  CONFLICT: "Plays for another team in this competition",
  INELIGIBLE: "Not eligible",
};

export function draftFromState(state: LineupEditorState): LineupDraft {
  const picks: LineupDraft["picks"] = {};
  let captain: string | null = null;
  for (const p of state.lineup?.players ?? []) {
    picks[p.player_id] = { role: p.role, slot: p.role === "STARTER" ? p.slot : null };
    if (p.captain) captain = p.player_id;
  }
  return { formation: state.lineup?.formation ?? state.formations[0]?.code ?? null, picks, captain };
}

export function formationOf(formations: Formation[], code: string | null): Formation | null {
  return formations.find((f) => f.code === code) ?? null;
}

/** Player occupying each slot of the current formation. */
export function slotOccupants(draft: LineupDraft): Map<number, string> {
  const m = new Map<number, string>();
  for (const [id, p] of Object.entries(draft.picks)) if (p.role === "STARTER" && p.slot !== null) m.set(p.slot, id);
  return m;
}

/**
 * Put a player in a role/slot. A slot holds one player: its previous
 * occupant becomes an unplaced starter (never silently dropped).
 */
export function assign(draft: LineupDraft, playerId: string, next: { role: LineupRole; slot: number | null } | null): LineupDraft {
  const picks = { ...draft.picks };
  if (next === null) {
    delete picks[playerId];
  } else {
    if (next.role === "STARTER" && next.slot !== null) {
      for (const [id, p] of Object.entries(picks)) {
        if (id !== playerId && p.role === "STARTER" && p.slot === next.slot) picks[id] = { role: "STARTER", slot: null };
      }
    }
    picks[playerId] = { role: next.role, slot: next.role === "STARTER" ? next.slot : null };
  }
  const captain = draft.captain && picks[draft.captain]?.role === "STARTER" ? draft.captain : null;
  return { ...draft, picks, captain };
}

/** Changing formation keeps starters in slots that still exist. */
export function changeFormation(draft: LineupDraft, formation: string | null, slotCount: number): LineupDraft {
  const picks: LineupDraft["picks"] = {};
  for (const [id, p] of Object.entries(draft.picks)) {
    picks[id] = p.role === "STARTER" && p.slot !== null && p.slot >= slotCount ? { role: "STARTER", slot: null } : p;
  }
  return { ...draft, formation, picks };
}

export function counts(draft: LineupDraft) {
  const all = Object.values(draft.picks);
  const starters = all.filter((p) => p.role === "STARTER");
  return {
    starters: starters.length,
    substitutes: all.length - starters.length,
    unplaced: starters.filter((p) => p.slot === null).length,
  };
}

/**
 * Immediate feedback in the editor. The server applies the same rules (and
 * eligibility) when saving/confirming; this never replaces it.
 */
export function draftProblems(draft: LineupDraft, state: LineupEditorState): string[] {
  const out: string[] = [];
  const c = counts(draft);
  const { rules } = state;
  const formation = formationOf(state.formations, draft.formation);
  if (c.starters < rules.min_starters)
    out.push(
      rules.max_starters === 11
        ? `Starting XI incomplete: ${c.starters} of at least ${rules.min_starters} (normally 11).`
        : `${startingLabel(rules.max_starters)} incomplete: ${c.starters} of ${rules.min_starters}.`,
    );
  if (c.starters > rules.max_starters) out.push(`Too many starters: ${c.starters} (maximum ${rules.max_starters}).`);
  if (c.substitutes > rules.max_substitutes) out.push(`Too many substitutes: ${c.substitutes} (maximum ${rules.max_substitutes}).`);
  if (c.unplaced > 0) out.push(`${c.unplaced} starter${c.unplaced === 1 ? " has" : "s have"} no position on the pitch.`);
  const gk = formation
    ? Object.values(draft.picks).filter((p) => p.role === "STARTER" && p.slot !== null && formation.slots[p.slot]?.position === "GK").length
    : 0;
  if (gk === 0) out.push("Choose a starting goalkeeper.");
  const byId = new Map(state.squad.map((s) => [s.player_id, s]));
  for (const p of state.lineup?.players ?? []) if (!byId.has(p.player_id)) byId.set(p.player_id, { ...p, position: null });
  for (const id of Object.keys(draft.picks)) {
    const m = byId.get(id);
    if (m && m.eligibility !== "CLEARED") out.push(`${playerName(m)} is not eligible (${ELIGIBILITY_LABEL[m.eligibility].toLowerCase()}).`);
  }
  return out;
}

export function toPayload(draft: LineupDraft): LineupPayloadEntry[] {
  const order = (e: [string, { role: LineupRole; slot: number | null }]) => (e[1].role === "STARTER" ? (e[1].slot ?? 50) : 100);
  return Object.entries(draft.picks)
    .sort((a, b) => order(a) - order(b))
    .map(([player_id, p]) => ({ player_id, role: p.role, slot: p.role === "STARTER" ? p.slot : null, captain: draft.captain === player_id }));
}

export function sameDraft(a: LineupDraft, b: LineupDraft): boolean {
  return JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b)) && a.formation === b.formation;
}

export function playerName(p: { name: string | null; shirt_number: number }): string {
  return p.name ? `${p.name} (${p.shirt_number})` : `No. ${p.shirt_number}`;
}

/* ─────────────────────────────── Pitch view ─────────────────────────────── */

export interface PitchPlayer {
  shirt: number;
  name: string | null;
  x: number;
  y: number;
  position: string | null;
  captain: boolean;
  goalkeeper: boolean;
  /** Came on as a substitute (current view only). */
  cameOn?: { minute: number; extra: number } | null;
  booked?: boolean;
  goals?: number;
}

interface LineupLike {
  players: {
    shirtNumber: number;
    name?: string | null;
    role: LineupRole;
    x?: number | null;
    y?: number | null;
    position?: string | null;
    captain: boolean;
    goalkeeper: boolean;
    sentOff?: boolean;
    booked?: boolean;
    goals?: number;
    onMinute?: number | null;
    onExtra?: number | null;
  }[];
}

interface SubLike {
  type: string;
  teamId: string;
  minute: number;
  addedTime?: number;
  player: { shirtNumber: number | null };
  playerIn?: { shirtNumber: number | null };
}

/**
 * Who is on the pitch now, where: starters in their positions; a substitute
 * takes the position of the player they replaced (in event order); sent-off
 * players leave. Derived from the confirmed line-up + non-voided events.
 */
/**
 * Who is on the pitch now, replaying substitutions over the starting
 * positions. `temporaryReds` (special rules): a red card takes the player off
 * until an approved SUSPENSION_RETURN puts them back in their spot.
 */
export function currentPitch(lineup: LineupLike, teamId: string, events: SubLike[], temporaryReds = false): PitchPlayer[] {
  const vacated = new Map<number, PitchPlayer>();
  const byShirt = new Map(lineup.players.map((p) => [p.shirtNumber, p]));
  const onPitch = new Map<number, PitchPlayer>();
  for (const p of lineup.players) {
    if (p.role !== "STARTER" || p.x == null || p.y == null) continue;
    onPitch.set(p.shirtNumber, {
      shirt: p.shirtNumber, name: p.name ?? null, x: p.x, y: p.y, position: p.position ?? null,
      captain: p.captain, goalkeeper: p.goalkeeper, booked: p.booked, goals: p.goals,
    });
  }
  for (const e of events) {
    if (temporaryReds && e.teamId === teamId && e.player.shirtNumber != null) {
      const n = e.player.shirtNumber;
      if (e.type === "RED_CARD" && onPitch.has(n)) {
        vacated.set(n, onPitch.get(n)!);
        onPitch.delete(n);
        continue;
      }
      if (e.type === "SUSPENSION_RETURN" && vacated.has(n)) {
        onPitch.set(n, vacated.get(n)!);
        vacated.delete(n);
        continue;
      }
      if (e.type === "EXCLUSION") {
        onPitch.delete(n);
        vacated.delete(n);
        continue;
      }
    }
    if (e.type !== "SUBSTITUTION" || e.teamId !== teamId) continue;
    const off = e.player.shirtNumber;
    const on = e.playerIn?.shirtNumber;
    if (off == null || on == null) continue;
    const spot = onPitch.get(off);
    const incoming = byShirt.get(on);
    if (!spot || !incoming) continue;
    onPitch.delete(off);
    onPitch.set(on, {
      shirt: on, name: incoming.name ?? null, x: spot.x, y: spot.y, position: spot.position,
      captain: incoming.captain, goalkeeper: spot.goalkeeper, booked: incoming.booked, goals: incoming.goals,
      cameOn: { minute: e.minute, extra: e.addedTime ?? 0 },
    });
  }
  for (const p of lineup.players) if (p.sentOff) onPitch.delete(p.shirtNumber);
  return [...onPitch.values()].sort((a, b) => b.y - a.y || a.x - b.x);
}

export function startingPitch(lineup: LineupLike): PitchPlayer[] {
  return lineup.players
    .filter((p) => p.role === "STARTER" && p.x != null && p.y != null)
    .map((p) => ({
      shirt: p.shirtNumber, name: p.name ?? null, x: p.x!, y: p.y!, position: p.position ?? null,
      captain: p.captain, goalkeeper: p.goalkeeper, booked: p.booked, goals: p.goals,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
}
