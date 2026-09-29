import "server-only";
import { dateKey } from "@/lib/format";
import type { LiveMatch, MatchRow } from "../types";
import { adminDb, must } from "./db";
import { listLiveMatches, listMatches } from "./matches";
import { listStaff } from "./staff";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */

export interface Warning {
  kind: "no-primary" | "setup" | "squad";
  severity: "high" | "medium";
  title: string;
  detail: string;
  href: string;
}

export interface Dashboard {
  counts: {
    live: number;
    today: number;
    upcoming: number;
    completed: number;
    activeCompetitions: number;
    teams: number;
    operators: number;
    withoutOperator: number;
  };
  live: LiveMatch[];
  todayMatches: MatchRow[];
  warnings: Warning[];
}

const SOON_MS = 3 * 60 * 60 * 1000; // warn about kick-offs in the next 3 hours

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const r = await q;
  if (r.error) throw new Error("Could not load dashboard counts.");
  return r.count ?? 0;
}

export async function getDashboard(): Promise<Dashboard> {
  const { db } = await adminDb();
  const nowIso = new Date().toISOString();
  const head = { count: "exact" as const, head: true };

  const [live, todayMatches, upcoming, completed, activeCompetitions, teams, staff, scheduled, competitions, squads] = await Promise.all([
    listLiveMatches(),
    listMatches({ from: dateKey(Date.now()), to: dateKey(Date.now()) }),
    count(db.from("matches").select("id", head).eq("status", "SCHEDULED").gte("scheduled_at", nowIso)),
    count(db.from("matches").select("id", head).eq("status", "FT")),
    count(db.from("competitions").select("id", head).eq("status", "ACTIVE")),
    count(db.from("teams").select("id", head).eq("active", true)),
    listStaff(),
    listMatches({ status: "scheduled", from: dateKey(Date.now()) }, 500),
    db
      .from("competitions")
      .select("id, name, short_name, status, season_id, competition_stages(count), competition_entries(team_id, team:teams(id, name, short_name))")
      .neq("status", "ARCHIVED"),
    db.from("squads").select("team_id, season_id, squad_players(count)"),
  ]);

  const warnings: Warning[] = [];
  const now = Date.now();
  const upcomingScheduled = scheduled.rows.filter((m) => Date.parse(m.scheduled_at) >= now - 15 * 60_000);
  const withoutOperator = upcomingScheduled.filter((m) => !m.assignments.some((a) => a.role === "PRIMARY"));
  for (const m of withoutOperator) {
    const t = Date.parse(m.scheduled_at);
    if (t - now <= SOON_MS) {
      warnings.push({
        kind: "no-primary",
        severity: "high",
        title: `${m.home.short_name} v ${m.away.short_name} has no primary operator`,
        detail: t < now ? "Kick-off time has passed." : `Kicks off in ${Math.max(1, Math.round((t - now) / 60_000))} min.`,
        href: `/admin/matches/${m.id}#operators`,
      });
    }
  }

  const squadSize = new Map<string, number>();
  for (const s of (must(squads, "squads") as any[]) ?? []) squadSize.set(`${s.team_id}:${s.season_id}`, s.squad_players?.[0]?.count ?? 0);
  const flagged = new Set<string>();
  for (const c of (must(competitions, "competitions") as any[]) ?? []) {
    const stages = c.competition_stages?.[0]?.count ?? 0;
    const entries = c.competition_entries ?? [];
    if (stages === 0 || entries.length < 2) {
      warnings.push({
        kind: "setup",
        severity: "medium",
        title: `${c.name} setup is unfinished`,
        detail: [stages === 0 ? "no stages" : null, entries.length < 2 ? `${entries.length} team${entries.length === 1 ? "" : "s"} entered` : null]
          .filter(Boolean)
          .join(", "),
        href: `/admin/competitions/${c.id}`,
      });
    }
    if (c.status !== "ACTIVE") continue;
    for (const e of entries) {
      const key = `${e.team_id}:${c.season_id}`;
      if (flagged.has(key) || !e.team) continue;
      const size = squadSize.get(key);
      if (size === undefined || size === 0) {
        flagged.add(key);
        warnings.push({
          kind: "squad",
          severity: "medium",
          title: `${e.team.name} has no squad`,
          detail: `Entered in ${c.short_name} but has no players registered for its season.`,
          href: `/admin/teams/${e.team_id}`,
        });
      }
    }
  }

  return {
    counts: {
      live: live.length,
      today: todayMatches.rows.length,
      upcoming,
      completed,
      activeCompetitions,
      teams,
      operators: staff.filter((s) => !s.deactivated_at && s.roles.includes("OPERATOR")).length,
      withoutOperator: withoutOperator.length,
    },
    live,
    todayMatches: todayMatches.rows,
    warnings: warnings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1)),
  };
}

