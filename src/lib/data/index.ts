import "server-only";
import { connection } from "next/server";
import { mockDataSource } from "./mock";
import type { SportsDataSource } from "./source";

export type { MatchQuery, MatchScope, SportsDataSource } from "./source";

/**
 * The active data source. Swap this for a Supabase-backed implementation of
 * `SportsDataSource` — pages and components only talk to the functions below.
 */
const source: SportsDataSource = mockDataSource;

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

export async function getStandings(competitionId: string) {
  await connection();
  return source.getStandings(competitionId);
}

export async function getHeadToHead(
  ...args: Parameters<SportsDataSource["getHeadToHead"]>
) {
  await connection();
  return source.getHeadToHead(...args);
}

/** Which backend is serving data — the UI shows a notice while this is "mock". */
export const DATA_SOURCE_KIND: "mock" | "live" = "mock";
