"use client";

import { useState } from "react";
import type { CompetitionOption, TeamRef } from "@/lib/admin/types";
import { Field, inputCls, selectCls } from "./ui";

export interface FixtureValues {
  competition_id?: string;
  stage_id?: string | null;
  group_id?: string | null;
  round_label?: string;
  home_team_id?: string;
  away_team_id?: string;
  venue_id?: string | null;
  scheduled_at?: string; // WAT datetime-local value
}

/**
 * Fixture form fields. Only teams entered in the chosen competition are
 * offered; the database re-validates everything (admin_create_match).
 */
export function FixtureFields({
  competitions,
  teams,
  venues,
  initial = {},
  lockCompetition = false,
}: {
  competitions: CompetitionOption[];
  teams: TeamRef[];
  venues: { id: string; short_name: string; name: string }[];
  initial?: FixtureValues;
  lockCompetition?: boolean;
}) {
  const [compId, setCompId] = useState(initial.competition_id ?? competitions[0]?.id ?? "");
  const comp = competitions.find((c) => c.id === compId);
  const [stageId, setStageId] = useState(initial.stage_id ?? comp?.stages[0]?.id ?? "");
  const [home, setHome] = useState(initial.home_team_id ?? "");
  const [away, setAway] = useState(initial.away_team_id ?? "");
  const stage = comp?.stages.find((s) => s.id === stageId);
  const entered = teams.filter((t) => comp?.teamIds.includes(t.id));
  const same = home && away && home === away;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Competition" className="sm:col-span-2">
        {lockCompetition ? (
          <>
            <input type="hidden" name="competition_id" value={compId} />
            <p className="flex h-11 items-center rounded-lg border border-line bg-subtle px-3 text-sm">{comp?.name}</p>
          </>
        ) : (
          <select
            name="competition_id"
            required
            value={compId}
            onChange={(e) => {
              const next = competitions.find((c) => c.id === e.target.value);
              setCompId(e.target.value);
              setStageId(next?.stages[0]?.id ?? "");
              setHome("");
              setAway("");
            }}
            className={selectCls}
          >
            {competitions.map((c) => (
              <option key={c.id} value={c.id} disabled={c.status === "ARCHIVED"}>
                {c.name} ({c.season}){c.status !== "ACTIVE" ? ` — ${c.status.toLowerCase()}` : ""}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Stage">
        <select name="stage_id" value={stageId} onChange={(e) => setStageId(e.target.value)} className={selectCls}>
          <option value="">None</option>
          {comp?.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Group">
        <select name="group_id" key={stageId} defaultValue={initial.stage_id === stageId ? (initial.group_id ?? "") : ""} disabled={!stage?.groups.length} className={selectCls}>
          <option value="">{stage?.groups.length ? "No group" : "No groups in this stage"}</option>
          {stage?.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Home team">
        <select name="home_team_id" required value={home} onChange={(e) => setHome(e.target.value)} className={selectCls} aria-invalid={same || undefined}>
          <option value="" disabled>
            Choose home team
          </option>
          {entered.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Away team">
        <select name="away_team_id" required value={away} onChange={(e) => setAway(e.target.value)} className={selectCls} aria-invalid={same || undefined}>
          <option value="" disabled>
            Choose away team
          </option>
          {entered.map((t) => (
            <option key={t.id} value={t.id} disabled={t.id === home}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      {same && (
        <p role="alert" className="text-sm font-semibold text-loss sm:col-span-2">
          Home and away team must be different.
        </p>
      )}
      {comp && entered.length < 2 && (
        <p role="alert" className="text-sm font-semibold text-warn sm:col-span-2">
          Fewer than two teams are entered in this competition. Enter teams on the competition page first.
        </p>
      )}
      <Field label="Matchday / round" hint="e.g. Matchday 3, Semi-final">
        <input name="round_label" maxLength={60} defaultValue={initial.round_label} className={inputCls} />
      </Field>
      <Field label="Venue">
        <select name="venue_id" defaultValue={initial.venue_id ?? ""} className={selectCls}>
          <option value="">To be confirmed</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Kick-off (campus time, WAT)" hint="Entered and shown in West Africa Time (UTC+1), whatever your device's time zone." className="sm:col-span-2">
        <input type="datetime-local" name="scheduled_at" required defaultValue={initial.scheduled_at} className={`${inputCls} sm:max-w-xs`} />
      </Field>
    </div>
  );
}
