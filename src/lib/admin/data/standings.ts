import "server-only";
import type { StandingRow } from "../types";
import { adminDb, must, TEAM_REF } from "./db";

export async function getStandings(competitionId: string): Promise<StandingRow[]> {
  const { db } = await adminDb();
  return must(
    await db
      .from("standings")
      .select(`group_id, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, rank, updated_at, team:teams(${TEAM_REF})`)
      .eq("competition_id", competitionId)
      .order("rank"),
    "standings",
  ) as unknown as StandingRow[];
}
