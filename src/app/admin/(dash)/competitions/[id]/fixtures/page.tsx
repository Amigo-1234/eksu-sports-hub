import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CompetitionHeader } from "@/components/admin/CompetitionHeader";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { FixtureGenerator } from "@/components/admin/FixtureGenerator";
import { Badge, btn, Card, Empty, Field, inputCls, selectCls, StatusBadge } from "@/components/admin/ui";
import { clearFixturesAction, scheduleFixtureAction } from "@/lib/admin/actions/engine";
import { getCompetitionOverview, teamNames, type FixtureView } from "@/lib/admin/data/engine";
import { listVenues } from "@/lib/admin/data/reference";
import { formatWatDateTime, toWatInput } from "@/lib/admin/time";
import type { MatchStatus } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Fixtures" };

export default async function FixturesPage({ params }: PageProps<"/admin/competitions/[id]/fixtures">) {
  const { id } = await params;
  const [o, venues] = await Promise.all([getCompetitionOverview(id), listVenues()]);
  if (!o) notFound();
  const names = teamNames(o);
  const team = (tid: string) => names.get(tid)?.short_name ?? "—";
  const venueName = new Map(venues.map((v) => [v.id, v.short_name || v.name]));
  const tableStages = o.stages.filter((s) => !s.is_knockout);
  const knockoutFixtures = o.fixtures.filter((f) => f.tie_id);

  const scheduleForm = (f: FixtureView) => (
    <Disclosure summary={f.status === "POSTPONED" ? "Reschedule" : "Schedule"}>
      <ActionForm action={scheduleFixtureAction} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="match_id" value={f.id} />
        <Field scope={f.id} label="Kick-off (WAT)">
          <input type="datetime-local" name="scheduled_at" required defaultValue={toWatInput(f.scheduled_at)} className={inputCls} />
        </Field>
        <Field scope={f.id} label="Venue">
          <select name="venue_id" defaultValue={f.venue_id ?? ""} className={selectCls}>
            <option value="">To be confirmed</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field scope={f.id} label="Matchday">
          <input type="number" name="matchday" min={1} max={200} defaultValue={f.matchday ?? ""} className={inputCls} />
        </Field>
        <Field scope={f.id} label={f.status === "POSTPONED" ? "Reason (required)" : "Reason"}>
          <input name="reason" maxLength={300} required={f.status === "POSTPONED"} placeholder="Pitch clash" className={inputCls} />
        </Field>
        <Submit className={`${btn.primary} sm:justify-self-start`}>Save</Submit>
      </ActionForm>
    </Disclosure>
  );

  const fixtureRow = (f: FixtureView) => (
    <li key={f.id} className="py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/admin/matches/${f.id}`} className="font-semibold break-words hover:underline">
            {team(f.home_team_id)} v {team(f.away_team_id)}
          </Link>
          <p className="text-xs text-ink-muted">
            {formatWatDateTime(f.scheduled_at)} · {f.venue_id ? venueName.get(f.venue_id) : "Venue TBC"}
            {f.reschedules > 0 && f.original_scheduled_at && <> · originally {formatWatDateTime(f.original_scheduled_at)}</>}
          </p>
        </div>
        <span className="flex items-center gap-2">
          {f.status === "FT" && (
            <span className="font-bold tabular-nums">
              {f.home_score}–{f.away_score}
              {f.home_pens != null && <span className="text-xs text-ink-muted"> ({f.home_pens}–{f.away_pens} p)</span>}
            </span>
          )}
          {f.reschedules > 0 && <Badge tone="warn">moved {f.reschedules}×</Badge>}
          <StatusBadge status={f.status as MatchStatus} />
        </span>
      </div>
      {(f.status === "SCHEDULED" || f.status === "POSTPONED") && scheduleForm(f)}
    </li>
  );

  return (
    <>
      <CompetitionHeader o={o} section="Fixtures" />
      <p className="mb-4 text-sm text-ink-muted">
        Postpone, cancel or abandon a fixture from its{" "}
        <Link href={`/admin/matches?competition=${id}`} className="underline">
          match page
        </Link>
        . Every kick-off, venue, matchday or status change is kept in the fixture history.
      </p>
      <div className="space-y-6">
        {tableStages.length === 0 && knockoutFixtures.length === 0 && <Empty title="No league or group stage" />}
        {tableStages.map((s) => {
          const ops = o.stage_ops.find((x) => x.stage_id === s.id);
          const fixtures = o.fixtures.filter((f) => f.stage_id === s.id);
          const matchdays = [...new Set(fixtures.map((f) => f.matchday ?? 0))].sort((a, b) => a - b);
          return (
            <Card
              key={s.id}
              title={s.name}
              description={ops?.generation ? `Generated ${formatWatDateTime(ops.generation.created_at)} · ${ops.generation.match_count} fixtures` : undefined}
              actions={ops?.locked ? <Badge tone="warn">Locked</Badge> : undefined}
            >
              {fixtures.length === 0 ? (
                <FixtureGenerator stageId={s.id} defaultLegs={s.legs} venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
              ) : (
                <>
                  {ops?.generation && !ops.locked && (
                    <div className="mb-3">
                      <ConfirmAction
                        action={clearFixturesAction}
                        hidden={{ stage_id: s.id }}
                        trigger="Clear & regenerate"
                        triggerClass={btn.small}
                        title="Clear the generated fixtures?"
                        body="Only possible while nothing has kicked off and no fixture has operators, line-ups, followers or audited edits. The removed list is kept in the audit log."
                        confirmLabel="Clear fixtures"
                        reason={{ label: "Reason", required: true }}
                      />
                    </div>
                  )}
                  {matchdays.map((md) => (
                    <section key={md} aria-label={md ? `Matchday ${md}` : "Unnumbered fixtures"} className="mb-3">
                      <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">{md ? `Matchday ${md}` : "Other fixtures"}</p>
                      <ul className="divide-y divide-line">{fixtures.filter((f) => (f.matchday ?? 0) === md).map(fixtureRow)}</ul>
                    </section>
                  ))}
                </>
              )}
            </Card>
          );
        })}
        {knockoutFixtures.length > 0 && (
          <Card title="Knockout fixtures" description="Created from the bracket once both teams are known. Schedule unresolved ties on the Knockout tab.">
            <ul className="divide-y divide-line">{knockoutFixtures.map(fixtureRow)}</ul>
          </Card>
        )}
      </div>
    </>
  );
}
