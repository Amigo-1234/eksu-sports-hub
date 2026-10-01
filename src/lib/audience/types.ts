/**
 * Private audience numbers for one match (operators/admins only — never
 * rendered on public pages or included in public payloads).
 *
 *   watching_now    distinct devices with a heartbeat in the last 50 s
 *   peak_viewers    highest watching_now ever observed for the match
 *   unique_viewers  distinct devices that opened the match page
 *   total_visits    page views (a tab returning within 10 min resumes its visit)
 */
export interface AudienceSummary {
  match_id: string;
  watching_now: number;
  peak_viewers: number;
  peak_at: string | null;
  unique_viewers: number;
  total_visits: number;
  first_view_at?: string | null;
  last_view_at?: string | null;
  active_window_seconds: number;
}

/** Heartbeat cadence for a visible match page; the server counts a device as watching for 50 s after a beat. */
export const HEARTBEAT_MS = 20_000;

export type AudienceRequest =
  | { t: "start"; match: string }
  | { t: "beat"; session: string }
  | { t: "end"; session: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the tiny request body. Clients only say "start/still here/gone" — never numbers. */
export function parseAudienceRequest(body: unknown): AudienceRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.t === "start" && typeof b.match === "string" && UUID.test(b.match)) return { t: "start", match: b.match };
  if ((b.t === "beat" || b.t === "end") && typeof b.session === "string" && UUID.test(b.session)) return { t: b.t, session: b.session };
  return null;
}
