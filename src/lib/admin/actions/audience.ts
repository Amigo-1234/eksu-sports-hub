"use server";

import type { AudienceSummary } from "@/lib/audience/types";
import { getMatchAudience } from "@/lib/admin/data/matches";

/** Polled by the admin audience panel (ADMIN session required by admin_match_audience). */
export async function refreshMatchAudience(matchId: string): Promise<AudienceSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  return getMatchAudience(matchId);
}
