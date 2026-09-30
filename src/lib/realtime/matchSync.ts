/**
 * Pure reconciliation for the public match page. Realtime hints only say
 * "match X changed at seq N"; canonical state always comes from the
 * `public_match_feed` RPC:
 *
 *   hint.seq <= known seq      → duplicate / stale hint, ignored
 *   hint.seq  > known seq      → fetch everything after the known seq (this
 *                                also recovers any gap of missed hints)
 *   (re)subscribe / resume     → same fetch: missed messages are never replayed
 *
 * Events merge by id (duplicates are harmless), voided ids are removed,
 * line-ups (always complete in the feed) are replaced, and
 * the canonical score must equal the score derived from non-voided scoring
 * events — otherwise the caller does a full resync.
 */
import { sortEvents, toEvent, toLineups, toPublicClock, toPublicStatus, toStats } from "../data/supabase/map.ts";
import type { MatchDetail, MatchEvent, Score } from "../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- RPC payload is mapped explicitly below. */

export const knownSeq = (m: Pick<MatchDetail, "seq">): number => m.seq ?? 0;

export function shouldFetch(m: Pick<MatchDetail, "seq">, hintSeq: number): boolean {
  return hintSeq > knownSeq(m);
}

const SCORING = new Set(["GOAL", "PENALTY_GOAL", "OWN_GOAL"]);

export function derivedScore(m: Pick<MatchDetail, "events" | "homeTeamId">): Score {
  const s: Score = { home: 0, away: 0 };
  for (const e of m.events) {
    if (!SCORING.has(e.type)) continue;
    const ownSide = e.teamId === m.homeTeamId ? "home" : "away";
    const side = e.type === "OWN_GOAL" ? (ownSide === "home" ? "away" : "home") : ownSide;
    s[side]++;
  }
  return s;
}

export type FeedResult =
  | { kind: "stale" } // response older than what we already show
  | { kind: "applied"; match: MatchDetail }
  | { kind: "inconsistent"; match: MatchDetail }; // needs a full resync

export function applyFeed(current: MatchDetail, feed: any): FeedResult {
  if (!feed?.match) return { kind: "stale" };
  const m = feed.match;
  const seq = Number(m.seq ?? 0);
  if (seq < knownSeq(current)) return { kind: "stale" };

  const byId = new Map<string, MatchEvent>(current.events.map((e) => [e.id, e]));
  for (const e of (feed.events ?? []) as any[]) {
    if (!e.voided) byId.set(e.id, toEvent(e, current.id));
  }
  for (const id of (feed.voided_ids ?? []) as string[]) byId.delete(id);

  const status = toPublicStatus(m.status);
  const started = status !== "SCHEDULED" && status !== "POSTPONED" && status !== "CANCELLED";
  const live = status === "LIVE_FIRST_HALF" || status === "LIVE_SECOND_HALF";
  const next: MatchDetail = {
    ...current,
    status,
    score: started ? { home: Number(m.home_score), away: Number(m.away_score) } : null,
    periodStartedAt: live ? m.period_started_at : null,
    statusNote: m.status_note ?? undefined,
    seq,
    clock: toPublicClock(m),
    events: sortEvents([...byId.values()]),
    // Line-ups are always sent complete: replace (a reopened line-up disappears).
    ...(Array.isArray(feed.lineups) ? { lineups: toLineups(feed.lineups) } : {}),
    ...("stats" in feed ? { stats: toStats(feed.stats) } : {}),
    ...(m.is_demo !== undefined ? { isDemo: Boolean(m.is_demo) } : {}),
  };
  if (next.score) {
    const d = derivedScore(next);
    if (d.home !== next.score.home || d.away !== next.score.away) return { kind: "inconsistent", match: next };
  }
  return { kind: "applied", match: next };
}
