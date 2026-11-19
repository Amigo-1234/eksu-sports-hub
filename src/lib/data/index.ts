import "server-only";
import { connection } from "next/server";
import { applyLiveMatches } from "../live-standings";
import { publicDataConfig } from "./config";
import { mockDataSource } from "./mock";
import type { SportsDataSource } from "./source";
import { registeredTeamIds, searchPlayers as searchPlayersLive, supabaseDataSource, type PlayerHit } from "./supabase";

export type { MatchQuery, MatchScope, SportsDataSource } from "./source";

/**
 * The active data source (see ./config — explicit, never a silent mock
 * fallback in production). Pages and components only talk to the functions
 * below.
 */
const failing = (error: string): SportsDataSource =>
  new Proxy({} as SportsDataSource, {
    get: (_, key) => (key === "now" ? () => Date.now() : () => Promise.reject(new Error(error))),
  });

const config = publicDataConfig();
const source: SportsDataSource =
  config.kind === "supabase" ? supabaseDataSource : config.kind === "mock" ? mockDataSource : failing(config.error);

/**
 * Match data is time-sensitive, so every read waits for a real request rather
 * than being frozen into the static build.
 */
async function requestTime(): Promise<number> {
  await connection();
  return source.now();
}

export const getNow = requestTime;

export async function getSports() {
  await connection();
  return source.getSports();
}

export async function getCompetitions() {
  await connection();
  return source.getCompetitions();
}

export async function getCompetition(id: string) {
  await connection();
  return source.getCompetition(id);
}

export async function getTeams() {
  await connection();
  return source.getTeams();
}

export async function getTeam(id: string) {
  await connection();
  return source.getTeam(id);
}

export async function getMatches(query?: Parameters<SportsDataSource["getMatches"]>[0]) {
  await connection();
  return source.getMatches(query);
}

export async function getMatch(id: string) {
  await connection();
  return source.getMatch(id);
}

export async function getSquad(teamId: string) {
  await connection();
  return source.getSquad(teamId);
}

export async function getTopScorers(competitionId: string) {
  await connection();
  return source.getTopScorers(competitionId);
}

/**
 * League table, live: completed matches plus any match in progress counted at
 * its current score, so the team winning right now climbs the table.
 */
export async function getStandings(competitionId: string) {
  await connection();
  const [rows, live] = await Promise.all([
    source.getStandings(competitionId),
    source.getMatches({ scope: "live", competitionId }).catch(() => []),
  ]);
  return applyLiveMatches(rows, live);
}

export async function getHeadToHead(
  ...args: Parameters<SportsDataSource["getHeadToHead"]>
) {
  await connection();
  return source.getHeadToHead(...args);
}

/** Which backend is serving data — the UI shows a notice while this is "mock". */
export const DATA_SOURCE_KIND: "mock" | "live" = config.kind === "mock" ? "mock" : "live";

/** Registered teams (current squads); empty for the mock source. */
export async function getRegisteredTeamIds(): Promise<string[]> {
  return config.kind === "supabase" ? registeredTeamIds() : [];
}

export type { PlayerHit };
/** Player name search (public squad data only); empty for the mock source. */
export async function searchPlayers(q: string): Promise<PlayerHit[]> {
  const term = q.trim();
  if (term.length < 2 || config.kind !== "supabase") return [];
  return searchPlayersLive(term.slice(0, 60));
}
