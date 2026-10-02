import type { Competition, CompetitionDetailView } from "./types";

export interface Section {
  path: "" | "/fixtures" | "/results" | "/table" | "/knockout" | "/scorers" | "/discipline";
  label: string;
}

/**
 * Public competition tabs by format (engine data when available, else the
 * basic league/knockout split of the demo data).
 *   League:  Overview · Fixtures · Results · Table · Top scorers
 *   Groups (+ knockout): Overview · Groups · Fixtures · Results · Knockout · Top scorers
 *   Knockout: Overview · Fixtures · Results · Knockout · Top scorers
 * Discipline appears once there is something to show.
 */
export function competitionSections(c: Competition, d: CompetitionDetailView | null): Section[] {
  if (!d) {
    return [
      { path: "", label: "Overview" },
      { path: "/fixtures", label: "Fixtures" },
      { path: "/results", label: "Results" },
      ...(c.format === "league" ? [{ path: "/table" as const, label: "Table" }] : []),
    ];
  }
  const hasGroups = d.stages.some((s) => s.type === "GROUP");
  const hasTable = d.stages.some((s) => s.hasTable && !s.isKnockout);
  const hasKnockout = d.stages.some((s) => s.isKnockout && s.ties.length > 0) || d.format === "KNOCKOUT" || d.format === "GROUPS_KNOCKOUT";
  const hasDiscipline = d.discipline.rulesEnabled || d.discipline.players.length > 0;
  return [
    { path: "", label: "Overview" },
    ...(hasGroups ? [{ path: "/table" as const, label: "Groups" }] : []),
    { path: "/fixtures", label: "Fixtures" },
    { path: "/results", label: "Results" },
    ...(!hasGroups && hasTable ? [{ path: "/table" as const, label: "Table" }] : []),
    ...(hasKnockout ? [{ path: "/knockout" as const, label: "Knockout" }] : []),
    { path: "/scorers", label: "Top scorers" },
    ...(hasDiscipline ? [{ path: "/discipline" as const, label: "Discipline" }] : []),
  ];
}
