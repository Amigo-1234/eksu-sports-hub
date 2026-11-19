/** Fan Zone (likes, banter, "Who will win?") — shared request/response shapes. */

export type FanTargetKind = "match" | "news";

export interface FanComment {
  id: string;
  name: string;
  body: string;
  at: string;
  likes: number;
  liked: boolean;
  mine: boolean;
  replies?: FanComment[];
}

export interface FanFeed {
  likes: number;
  liked: boolean;
  comment_count: number;
  /** Display name of this device (light sign-in), or null. */
  name: string | null;
  vote: { home: number; draw: number; away: number; mine: "HOME" | "DRAW" | "AWAY" | null } | null;
  comments: FanComment[];
}

export type FanAction =
  | { action: "like" | "unlike" }
  | { action: "vote"; pick: "HOME" | "DRAW" | "AWAY" }
  | { action: "comment"; body: string; parent_id?: string | null }
  | { action: "like_comment" | "unlike_comment" | "report" | "delete"; comment_id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseTarget(kind: unknown, id: unknown): { kind: FanTargetKind; id: string } | null {
  if (kind === "match" && typeof id === "string" && UUID.test(id)) return { kind, id: id.toLowerCase() };
  if (kind === "news" && typeof id === "string" && SLUG.test(id) && id.length >= 3 && id.length <= 100) return { kind, id };
  return null;
}

/** Rebuilds the request field by field: nothing unexpected reaches the database. */
export function parseAction(raw: unknown): { action: string; payload: Record<string, string> } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.action) {
    case "like":
    case "unlike":
      return { action: r.action, payload: {} };
    case "vote":
      return typeof r.pick === "string" && ["HOME", "DRAW", "AWAY"].includes(r.pick) ? { action: "vote", payload: { pick: r.pick } } : null;
    case "comment": {
      if (typeof r.body !== "string") return null;
      const body = r.body.trim().slice(0, 500);
      if (!body) return null;
      const parent = typeof r.parent_id === "string" && UUID.test(r.parent_id) ? r.parent_id : "";
      return { action: "comment", payload: { body, parent_id: parent } };
    }
    case "like_comment":
    case "unlike_comment":
    case "report":
    case "delete":
      return typeof r.comment_id === "string" && UUID.test(r.comment_id) ? { action: r.action, payload: { comment_id: r.comment_id } } : null;
    default:
      return null;
  }
}

/* ── Fan games: predictions and Player of the Match ─────────────────────── */

export interface FanGames {
  prediction: {
    open: boolean;
    count: number;
    mine: { home: number; away: number; points: number | null } | null;
    popular: { home: number; away: number; n: number }[];
    exact: number | null;
  };
  potm: {
    open: boolean;
    closes_at: string;
    total: number;
    mine: string | null;
    candidates: { id: string; name: string; team_id: string; shirt: number | null; votes: number }[];
  } | null;
}

export type GamesAction = { action: "predict"; home: number; away: number } | { action: "unpredict" } | { action: "potm"; player_id: string };

export function parseGamesAction(raw: unknown): { action: string; payload: Record<string, number | string> } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const goal = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 30;
  if (r.action === "predict") return goal(r.home) && goal(r.away) ? { action: "predict", payload: { home: r.home as number, away: r.away as number } } : null;
  if (r.action === "unpredict") return { action: "unpredict", payload: {} };
  if (r.action === "potm") return typeof r.player_id === "string" && UUID.test(r.player_id) ? { action: "potm", payload: { player_id: r.player_id } } : null;
  return null;
}

export interface LeaderRow {
  rank: number;
  name: string;
  points: number;
  exact: number;
  played: number;
  me?: boolean;
}
export interface Leaderboard {
  period: "week" | "all";
  rows: LeaderRow[];
  me: Omit<LeaderRow, "me"> | null;
  players: number;
}
