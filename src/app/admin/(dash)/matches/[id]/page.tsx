import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { AddEventForm } from "@/components/admin/AddEventForm";
import { AssignForm } from "@/components/admin/AssignForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { FixtureFields } from "@/components/admin/FixtureFields";
import { JsonDiff } from "@/components/admin/JsonDiff";
import { LiveClock } from "@/components/admin/LiveClock";
import { clockLabel } from "@/lib/admin/clock";
import { eventLabel } from "@/components/admin/LiveMatchCard";
import { Badge, btn, Card, Empty, Field, inputCls, PageTitle, StatusBadge } from "@/components/admin/ui";
import { clearAssignments, rescheduleMatch, setMatchOutcome, updateFixture, voidEvent } from "@/lib/admin/actions/matches";
import { setLineupOverride } from "@/lib/admin/actions/lineups";
import { recomputeStandings } from "@/lib/admin/actions/competitions";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { getMatchAudience, getMatchRow, inspectMatch, listEventTypes, type TeamLineupSummary } from "@/lib/admin/data/matches";
import { AudiencePanel } from "@/components/admin/AudiencePanel";
import { listVenues } from "@/lib/admin/data/reference";
import { listAssignableOperators } from "@/lib/admin/data/staff";
import { listTeamRefs, squadsForMatch } from "@/lib/admin/data/teams";
import { formatWatDateTime, serverNow, toWatInput } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Match" };

const LIVE = new Set(["1H", "HT", "2H", "ET1", "ET_BREAK", "ET2", "PENS"]);

export default async function MatchPage({ params, searchParams }: PageProps<"/admin/matches/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const created = (await searchParams).created === "1";
  const row = await getMatchRow(id);
  if (!row) notFound();
  const [detail, operators, eventTypes, squads, competitions, teams, venues, audience] = await Promise.all([
    inspectMatch(id),
    listAssignableOperators(),
    listEventTypes(),
    squadsForMatch(id),
    listCompetitionOptions(),
    listTeamRefs(),
    listVenues(),
    getMatchAudience(id),
  ]);
  const now = serverNow();
  const m = detail.state.match;
  const status = m.status;
  const primary = detail.assignments.find((a) => a.active && a.role === "PRIMARY");
  const backup = detail.assignments.find((a) => a.active && a.role === "BACKUP");
  const canAssign = !["FT", "CANCELLED", "ABANDONED"].includes(status);
  const canCorrect = ["1H", "HT", "2H", "ET1", "ET_BREAK", "ET2", "PENS", "FT", "ABANDONED"].includes(status);
  const teamName = (tid: string) => (tid === m.home_team_id ? row.home.short_name : row.away.short_name);
  const events = [...detail.state.events].sort((a, b) => b.seq - a.seq);
  const startsIn = Date.parse(row.scheduled_at) - now;

  return (
    <>
      <PageTitle
        title={`${row.home.short_name} v ${row.away.short_name}`}
        back={{ href: "/admin/matches", label: "Fixtures" }}
        description={`${row.competition.name}${row.round_label ? ` · ${row.round_label}` : ""} · ${formatWatDateTime(row.scheduled_at)} WAT · ${row.venue?.short_name ?? "Venue TBC"}`}
        actions={
          <Link href={`/admin/audit?match=${id}`} className={btn.secondary}>
            Full audit trail
          </Link>
        }
      />
      {created && <p className="mb-4 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">Fixture created. Assign a primary operator below.</p>}
      {status === "SCHEDULED" && !primary && startsIn < 3 * 3600_000 && (
        <p role="alert" className="mb-4 rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm font-semibold text-loss">
          {startsIn < 0 ? "Kick-off time has passed" : "Kick-off is soon"} and no primary operator is assigned.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Match state" description="Canonical state from the database. The score is derived from events and cannot be edited directly.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={status} />
              {LIVE.has(status) && (
                <span className="text-sm font-bold text-live">
                  <LiveClock match={m} serverNow={Date.parse(detail.state.server_time) || now} initial={clockLabel(m, Date.parse(detail.state.server_time) || now)} />
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <span className="text-right font-display text-xl font-extrabold break-words uppercase">{row.home.name}</span>
              <span className="rounded-lg bg-ink px-3 py-1.5 font-display text-4xl leading-none font-extrabold text-white tabular-nums" aria-label={`Score ${m.home_score} to ${m.away_score}`}>
                {m.home_score}–{m.away_score}
              </span>
              <span className="font-display text-xl font-extrabold break-words uppercase">{row.away.name}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-muted">Period</dt>
                <dd className="font-semibold">{m.current_period ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Clock</dt>
                <dd className="font-semibold">{m.clock_running ? (m.paused_at ? "Paused" : "Running") : "Stopped"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Stoppage announced</dt>
                <dd className="font-semibold">{Math.round(m.stoppage_seconds / 60)} min</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">In control</dt>
                <dd className="font-semibold">{detail.match.active_operator_name ?? "Nobody"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Kicked off</dt>
                <dd className="font-semibold">{formatWatDateTime(detail.match.started_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Finished</dt>
                <dd className="font-semibold">{formatWatDateTime(detail.match.finished_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Sequence</dt>
                <dd className="font-semibold tabular-nums">{m.seq}</dd>
              </div>
              {detail.match.status_note && (
                <div className="col-span-2">
                  <dt className="text-xs text-ink-muted">Status note</dt>
                  <dd className="font-semibold break-words">{detail.match.status_note}</dd>
                </div>
              )}
            </dl>
            {detail.periods.length > 0 && (
              <>
                <h3 className="mt-4 mb-1 text-xs font-extrabold tracking-wide text-ink-muted uppercase">Period history</h3>
                <ul className="text-sm">
                  {detail.periods.map((p) => (
                    <li key={p.period}>
                      {p.period === 1 ? "1st half" : p.period === 2 ? "2nd half" : `Period ${p.period}`}: {formatWatDateTime(p.started_at)} → {p.ended_at ? formatWatDateTime(p.ended_at) : "in progress"}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card
            title="Line-ups"
            id="lineups"
            description={
              status === "SCHEDULED"
                ? "Both line-ups must be confirmed before the operator can start the match. Confirmed line-ups are public."
                : "Line-ups are locked once the match has started. Corrections are audited."
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(["home", "away"] as const).map((side) => (
                <LineupSummary
                  key={side}
                  side={side}
                  team={side === "home" ? row.home.short_name : row.away.short_name}
                  lineup={detail.lineups[side]}
                  href={`/admin/matches/${id}/lineup/${side}`}
                  scheduled={status === "SCHEDULED"}
                />
              ))}
            </div>
            {status === "SCHEDULED" && (
              <div className="mt-4 rounded-lg border border-line bg-canvas p-3 text-sm">
                <h3 className="font-extrabold uppercase">Emergency kick-off override</h3>
                {detail.match.lineup_override_reason ? (
                  <>
                    <p className="mt-1">
                      <Badge tone="warn">Override active</Badge> {detail.match.lineup_override_reason}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Recorded {formatWatDateTime(detail.match.lineup_override_at)} by {detail.match.lineup_override_by_name ?? "an administrator"}. The
                      operator can start without confirmed line-ups.
                    </p>
                    <div className="mt-2">
                      <ConfirmAction
                        action={setLineupOverride}
                        hidden={{ match_id: id, clear: "1" }}
                        trigger="Remove override"
                        triggerClass={btn.small}
                        tone="primary"
                        title="Require confirmed line-ups again?"
                        confirmLabel="Remove override"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-ink-muted">
                      Only for emergencies (e.g. team sheets unavailable and the referee is ready). Operators cannot bypass line-up confirmation.
                    </p>
                    <div className="mt-2">
                      <ConfirmAction
                        action={setLineupOverride}
                        hidden={{ match_id: id }}
                        trigger="Allow start without line-ups"
                        triggerClass={btn.small}
                        title="Allow kick-off without confirmed line-ups?"
                        body="The operator will be able to start this match even though line-ups are missing or not confirmed. This is recorded in the audit log."
                        reason={{ label: "Reason (required)", required: true, placeholder: "e.g. Team sheets lost; referee approved kick-off" }}
                        typeToConfirm="OVERRIDE"
                        confirmLabel="Record override"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>

          <Card title="Events" id="events" description="Corrections never edit an event: voiding keeps it on record, and the score is recomputed.">
            {events.length === 0 ? (
              <Empty title="No events recorded" />
            ) : (
              <ol className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id} className={`flex flex-wrap items-start gap-3 py-2.5 ${e.voided_at ? "opacity-70" : ""}`}>
                    <span className="w-14 shrink-0 font-display text-lg font-extrabold tabular-nums">
                      {e.minute}
                      {e.minute_extra ? `+${e.minute_extra}` : ""}&apos;
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold ${e.voided_at ? "line-through" : ""}`}>
                        {eventLabel(e.type)} · {teamName(e.team_id)}
                        {e.shirt_number != null && ` · #${e.shirt_number}`}
                        {e.related_shirt_number != null && ` → #${e.related_shirt_number}`}
                      </p>
                      <p className="text-xs text-ink-muted">
                        seq {e.seq} · recorded {formatWatDateTime(e.recorded_at)} by {detail.recorders[e.id] ?? "unknown"}
                        {e.client_queued ? " · sent after reconnect" : ""}
                      </p>
                      {e.voided_at && (
                        <p className="mt-0.5 text-xs font-semibold text-loss">
                          <Badge tone="bad">Voided</Badge> {e.void_reason}
                        </p>
                      )}
                    </div>
                    {!e.voided_at && (
                      <ConfirmAction
                        action={voidEvent}
                        hidden={{ match_id: id, event_id: e.id }}
                        trigger="Void"
                        triggerClass={btn.small}
                        title={`Void ${eventLabel(e.type).toLowerCase()} at ${e.minute}'?`}
                        body="The event stays in the record marked as voided. The score (and standings, if full-time) is recomputed."
                        reason={{ label: "Correction reason", required: true, placeholder: "e.g. Recorded against the wrong team" }}
                        confirmLabel="Void event"
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canCorrect ? (
              <details className="mt-4 rounded-lg border border-line bg-canvas p-3">
                <summary className="cursor-pointer font-bold text-brand-700">Add a missing event</summary>
                <div className="mt-3">
                  <AddEventForm
                    matchId={id}
                    eventTypes={eventTypes}
                    home={{ id: m.home_team_id, name: row.home.short_name }}
                    away={{ id: m.away_team_id, name: row.away.short_name }}
                    squads={squads}
                    maxPeriod={m.current_period ?? 1}
                  />
                </div>
              </details>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">Events can be added once the match has started.</p>
            )}
          </Card>

          <Card title="Audit history" description="Every change to this match, newest first.">
            {detail.audit.length === 0 ? (
              <Empty title="No audit entries" />
            ) : (
              <ol className="space-y-2">
                {detail.audit.slice(0, 30).map((a) => (
                  <li key={a.id} className="rounded-lg border border-line p-2.5">
                    <details>
                      <summary className="cursor-pointer text-sm">
                        <span className="font-mono text-xs font-bold">{a.action}</span> · {a.actor ?? "system"} · <span className="text-ink-muted">{formatWatDateTime(a.at)}</span>
                      </summary>
                      <div className="mt-2">
                        <JsonDiff before={a.before} after={a.after} />
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            )}
            {detail.audit.length > 30 && (
              <Link href={`/admin/audit?match=${id}`} className={`${btn.ghost} mt-2`}>
                See all {detail.audit.length} entries →
              </Link>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Audience" id="audience" description="Private engagement figures for this match page.">
            <AudiencePanel matchId={id} initial={audience} live={LIVE.has(status)} />
          </Card>
          <Card title="Operators" id="operators">
            <dl className="mb-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Primary</dt>
                <dd className="text-right font-semibold">{primary ? primary.display_name : <Badge tone="bad">Not assigned</Badge>}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Backup</dt>
                <dd className="text-right font-semibold">{backup?.display_name ?? "—"}</dd>
              </div>
              {primary?.prep_completed_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Prep checks</dt>
                  <dd className="text-right font-semibold">Done {formatWatDateTime(primary.prep_completed_at)}</dd>
                </div>
              )}
            </dl>
            {canAssign ? (
              <>
                {operators.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No active operators. <Link href="/admin/staff" className="font-semibold text-brand-700 underline">Invite staff</Link> first.
                  </p>
                ) : (
                  <AssignForm matchId={id} operators={operators} primary={primary?.user_id} backup={backup?.user_id} />
                )}
                {(primary || backup) && (
                  <div className="mt-3">
                    <ConfirmAction
                      action={clearAssignments}
                      hidden={{ match_id: id }}
                      trigger="Remove all operators"
                      triggerClass={btn.small}
                      title="Remove all operators from this match?"
                      body={LIVE.has(status) ? "The match is live. The operator in control will lose access immediately." : undefined}
                      confirmLabel="Remove operators"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">Assignments are closed for a {status.toLowerCase()} match.</p>
            )}
            {detail.assignments.some((a) => !a.active) && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-muted">Previous assignments</summary>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {detail.assignments
                    .filter((a) => !a.active)
                    .map((a) => (
                      <li key={a.user_id}>
                        {a.display_name} ({a.role.toLowerCase()}) · removed {formatWatDateTime(a.revoked_at)}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Card>

          <Card title="Match status" description="Deliberate, audited status changes. Kick-off, half-time and full-time are controlled by the operator.">
            <div className="flex flex-wrap gap-2">
              {status === "SCHEDULED" && (
                <ConfirmAction
                  action={setMatchOutcome}
                  hidden={{ match_id: id, status: "POSTPONED" }}
                  trigger="Postpone"
                  title="Postpone this match?"
                  body="It can be rescheduled later."
                  reason={{ label: "Reason", required: true, placeholder: "e.g. Waterlogged pitch" }}
                  typeToConfirm="POSTPONED"
                  confirmLabel="Postpone match"
                />
              )}
              {(status === "SCHEDULED" || status === "POSTPONED") && (
                <ConfirmAction
                  action={setMatchOutcome}
                  hidden={{ match_id: id, status: "CANCELLED" }}
                  trigger="Cancel"
                  title="Cancel this match?"
                  body="Cancelled matches cannot be rescheduled or edited."
                  reason={{ label: "Reason", required: true }}
                  typeToConfirm="CANCELLED"
                  confirmLabel="Cancel match"
                />
              )}
              {LIVE.has(status) && (
                <ConfirmAction
                  action={setMatchOutcome}
                  hidden={{ match_id: id, status: "ABANDONED" }}
                  trigger="Abandon"
                  title="Abandon this live match?"
                  body="The clock stops and the operator can no longer record events. This cannot be undone."
                  reason={{ label: "Reason", required: true, placeholder: "e.g. Floodlight failure" }}
                  typeToConfirm="ABANDONED"
                  confirmLabel="Abandon match"
                />
              )}
              {status === "FT" && (
                <ActionForm action={recomputeStandings}>
                  <input type="hidden" name="competition_id" value={row.competition.id} />
                  <Submit className={btn.secondary} pendingLabel="Recomputing…">
                    Recompute standings
                  </Submit>
                </ActionForm>
              )}
              {["CANCELLED", "ABANDONED"].includes(status) && <p className="text-sm text-ink-muted">No further status changes are possible.</p>}
            </div>
            {status === "POSTPONED" && (
              <div className="mt-4 rounded-lg border border-line bg-canvas p-3">
                <h3 className="mb-2 text-sm font-extrabold uppercase">Reschedule</h3>
                <ActionForm action={rescheduleMatch} className="space-y-3">
                  <input type="hidden" name="match_id" value={id} />
                  <Field label="New kick-off (campus time, WAT)">
                    <input type="datetime-local" name="scheduled_at" required className={inputCls} />
                  </Field>
                  <Field label="Note (optional)">
                    <input name="reason" maxLength={300} className={inputCls} />
                  </Field>
                  <Submit className={btn.primary}>Reschedule</Submit>
                </ActionForm>
              </div>
            )}
          </Card>

          {status === "SCHEDULED" && (
            <Card title="Edit fixture" description="Only scheduled fixtures can be edited.">
              <ActionForm action={updateFixture}>
                <input type="hidden" name="match_id" value={id} />
                <FixtureFields
                  competitions={competitions.filter((c) => c.id === row.competition.id)}
                  teams={teams}
                  venues={venues}
                  lockCompetition
                  initial={{
                    competition_id: row.competition.id,
                    stage_id: row.stage_id,
                    group_id: row.group_id,
                    round_label: row.round_label,
                    home_team_id: row.home_team_id,
                    away_team_id: row.away_team_id,
                    venue_id: row.venue_id,
                    scheduled_at: toWatInput(row.scheduled_at),
                  }}
                />
                <Submit className={`${btn.primary} mt-4`}>Save fixture</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function LineupSummary({
  side,
  team,
  lineup,
  href,
  scheduled,
}: {
  side: "home" | "away";
  team: string;
  lineup: TeamLineupSummary | null;
  href: string;
  scheduled: boolean;
}) {
  const starters = lineup?.players.filter((p) => p.role === "STARTER").length ?? 0;
  const subs = (lineup?.players.length ?? 0) - starters;
  const captain = lineup?.players.find((p) => p.captain);
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">{side === "home" ? "Home" : "Away"}</p>
      <p className="flex flex-wrap items-center gap-2 font-bold">
        {team}
        {!lineup ? (
          <Badge tone="bad">Not prepared</Badge>
        ) : lineup.status === "CONFIRMED" ? (
          <Badge tone="ok">Confirmed</Badge>
        ) : (
          <Badge tone="warn">Draft</Badge>
        )}
      </p>
      {lineup && (
        <p className="mt-1 text-sm text-ink-muted">
          {lineup.formation ?? "No formation"} · {starters} starters · {subs} subs{captain ? ` · captain No. ${captain.shirt_number}` : ""}
        </p>
      )}
      {lineup && lineup.problems.length > 0 && scheduled && (
        <ul className="mt-1 list-disc pl-5 text-xs text-warn">
          {lineup.problems.slice(0, 3).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Link href={href} className={`${btn.small} mt-2`}>
        {scheduled ? (lineup ? "Edit line-up" : "Prepare line-up") : "View / correct"}
      </Link>
    </div>
  );
}
