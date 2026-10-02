import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitionHeader } from "@/components/admin/CompetitionHeader";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Badge, btn, Card, Empty, StatusBadge } from "@/components/admin/ui";
import { completeCompetitionAction, completeStageAction, recomputeAction, reopenCompetitionAction } from "@/lib/admin/actions/engine";
import { getCompetitionOverview, teamNames, type StageOps, type StageView } from "@/lib/admin/data/engine";
import { formatWatDateTime } from "@/lib/admin/time";
import { STAGE_TYPE_LABEL, type MatchStatus } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Competition control centre" };

const ACTION_LABEL: Record<string, string> = {
  COMPETITION_FORMAT_CHANGED: "Format changed",
  COMPETITION_RULES_CHANGED: "Rules changed",
  GROUP_CREATED: "Group created",
  TEAM_ASSIGNED_TO_GROUP: "Team drawn into a group",
  FIXTURES_GENERATED: "Fixtures generated",
  FIXTURES_CLEARED: "Generated fixtures cleared",
  FIXTURE_RESCHEDULED: "Fixture rescheduled",
  STAGE_LOCKED: "Stage locked (first kick-off)",
  STAGE_COMPLETED: "Stage completed",
  KNOCKOUT_GENERATED: "Knockout bracket generated",
  TEAM_ADVANCED: "Team advanced",
  KNOCKOUT_RECONCILIATION_REQUIRED: "Bracket needs reconciliation",
  KNOCKOUT_RECONCILED: "Bracket reconciled",
  DISCIPLINARY_RULE_CHANGED: "Discipline rules changed",
  PLAYER_SUSPENDED: "Player suspended",
  SUSPENSION_SERVED: "Suspension served",
  SUSPENSION_CANCELLED: "Suspension cancelled",
  COMPETITION_COMPLETED: "Competition completed",
  COMPETITION_REOPENED: "Competition reopened",
  QUALIFICATION_DECIDED: "Qualification decision",
  LOCK_OVERRIDE: "Lock override",
  COMPETITION_ENGINE_ERROR: "Engine error (run Recompute)",
};

function StageRow({ s, ops, competitionId }: { s: StageView; ops: StageOps | undefined; competitionId: string }) {
  const m = ops?.matches;
  const pct = m && m.total > 0 ? Math.round(((m.finished + m.cancelled) / m.total) * 100) : 0;
  const tieCount = s.ties?.length ?? 0;
  const next = (() => {
    if (s.status === "COMPLETED") return null;
    if (s.stage_type === "GROUP" && (s.groups?.length ?? 0) <= 1 && !s.groups?.[0]?.id) return { href: "groups", label: "Create groups & draw" };
    if (!s.is_knockout && (m?.total ?? 0) === 0) return { href: "fixtures", label: "Generate fixtures" };
    if (s.is_knockout && tieCount === 0) return { href: "knockout", label: "Generate bracket" };
    if (s.is_knockout && (ops?.ties_unscheduled ?? 0) > 0) return { href: "knockout", label: `Schedule ${ops?.ties_unscheduled} tie(s)` };
    return null;
  })();
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-bold break-words">
          {s.order}. {s.name} <span className="text-xs font-semibold text-ink-muted">{STAGE_TYPE_LABEL[s.stage_type]}</span>
        </p>
        <span className="flex flex-wrap gap-1">
          <Badge tone={s.status === "COMPLETED" ? "ok" : s.status === "ACTIVE" ? "live" : "neutral"}>{s.status.toLowerCase()}</Badge>
          {s.locked && s.status !== "COMPLETED" && <Badge tone="warn">locked</Badge>}
        </span>
      </div>
      {m && m.total > 0 && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-subtle" role="img" aria-label={`${pct}% of matches resolved`}>
            <div className="h-full bg-brand-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {m.finished}/{m.total} played{m.live ? ` · ${m.live} live` : ""}{m.postponed ? ` · ${m.postponed} postponed` : ""}
            {m.cancelled ? ` · ${m.cancelled} cancelled` : ""}{m.abandoned ? ` · ${m.abandoned} abandoned` : ""}
          </p>
        </div>
      )}
      {s.is_knockout && tieCount > 0 && <p className="mt-1 text-xs text-ink-muted">{tieCount} tie(s) in the bracket</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {next && (
          <Link href={`/admin/competitions/${competitionId}/${next.href}`} className={btn.small}>
            {next.label} →
          </Link>
        )}
        {s.status !== "COMPLETED" && m && m.total > 0 && m.finished + m.cancelled === m.total && (
          <ConfirmAction
            action={completeStageAction}
            hidden={{ stage_id: s.id }}
            trigger="Complete stage"
            triggerClass={btn.small}
            tone="primary"
            title={`Complete ${s.name}?`}
            body="Requires every match finished or cancelled, every tie decided and no pending qualification."
            confirmLabel="Complete stage"
          />
        )}
      </div>
    </li>
  );
}

export default async function CompetitionControlCentre({ params }: PageProps<"/admin/competitions/[id]">) {
  const { id } = await params;
  const o = await getCompetitionOverview(id);
  if (!o) notFound();
  const c = o.competition;
  const names = teamNames(o);
  const team = (tid: string | null) => (tid ? (names.get(tid)?.short_name ?? "—") : "TBC");
  const ops = new Map(o.stage_ops.map((x) => [x.stage_id, x]));
  const toReconcile = o.stage_ops.reduce((n, s) => n + s.ties_to_reconcile, 0);
  const toDecide = o.stage_ops.reduce((n, s) => n + s.ties_to_decide, 0);
  const pendingQ = o.stage_ops.reduce((n, s) => n + s.pending_qualification, 0);
  const engineErrors = o.recent_activity.filter((a) => a.action === "COMPETITION_ENGINE_ERROR").length;
  const suspended = o.discipline_alerts.filter((a) => a.kind === "SUSPENDED").length;
  const atRisk = o.discipline_alerts.filter((a) => a.kind === "ONE_YELLOW_AWAY").length;
  const pendingScreening = o.screening.PENDING ?? 0;
  const tables = o.stages.filter((s) => s.groups && s.groups.some((g) => g.rows.length > 0));

  const alerts: { tone: "bad" | "warn"; text: string; href: string }[] = [
    ...(toReconcile ? [{ tone: "bad" as const, text: `${toReconcile} knockout tie(s) need reconciliation after a corrected result`, href: "knockout" }] : []),
    ...(engineErrors ? [{ tone: "bad" as const, text: "The competition engine reported an error — run Recompute", href: "" }] : []),
    ...(toDecide ? [{ tone: "warn" as const, text: `${toDecide} tie(s) finished without a winner — decide them`, href: "knockout" }] : []),
    ...(pendingQ ? [{ tone: "warn" as const, text: `${pendingQ} team(s) have a pending qualification place`, href: "knockout" }] : []),
    ...(suspended ? [{ tone: "warn" as const, text: `${suspended} player(s) currently suspended`, href: "discipline" }] : []),
    ...(atRisk ? [{ tone: "warn" as const, text: `${atRisk} player(s) one yellow card from a suspension`, href: "discipline" }] : []),
    ...(pendingScreening ? [{ tone: "warn" as const, text: `${pendingScreening} player screening(s) pending for entered teams`, href: "../../screening" }] : []),
  ];

  return (
    <>
      <CompetitionHeader o={o} />

      {c.status === "COMPLETED" && (
        <section className="mb-5 rounded-card border-2 border-accent-400 bg-accent-100 p-4" aria-label="Honours">
          <p className="text-xs font-extrabold tracking-widest text-ink-muted uppercase">Champion</p>
          <p className="font-display text-3xl font-extrabold">{c.champion_team_id ? names.get(c.champion_team_id)?.name : "—"}</p>
          <p className="mt-1 text-sm">
            Runner-up: <strong>{team(c.runner_up_team_id)}</strong>
            {c.third_place_team_id && (
              <>
                {" "}
                · Third: <strong>{team(c.third_place_team_id)}</strong>
              </>
            )}
          </p>
        </section>
      )}

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Teams", o.summary.teams],
          ["Played", `${o.summary.matches_played}/${o.summary.matches_total}`],
          ["Goals", o.summary.goals],
          ["Live now", o.summary.live],
          ["Suspended", suspended],
        ].map(([k, v]) => (
          <div key={k} className="rounded-card border border-line bg-surface p-3">
            <dt className="text-xs font-bold tracking-wide text-ink-muted uppercase">{k}</dt>
            <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {alerts.length > 0 && (
        <ul className="mb-5 space-y-2" aria-label="Needs attention">
          {alerts.map((a) => (
            <li key={a.text} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${a.tone === "bad" ? "border-live/40 bg-live/10" : "border-warn/40 bg-warn/10"}`}>
              <span>{a.text}</span>
              {a.href && (
                <Link href={`/admin/competitions/${c.id}/${a.href}`} className="font-bold underline">
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card title="Stages" description="Progress through the competition. Each stage locks when its first match kicks off.">
            {o.stages.length === 0 ? (
              <Empty title="No stages yet">
                <Link href={`/admin/competitions/${c.id}/setup`} className="underline">Add stages in Setup</Link>
              </Empty>
            ) : (
              <ul className="space-y-3">
                {o.stages.map((s) => (
                  <StageRow key={s.id} s={s} ops={ops.get(s.id)} competitionId={c.id} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Next fixtures">
            {o.next_fixtures.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-line">
                {o.next_fixtures.slice(0, 6).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/admin/matches/${f.id}`} className="min-w-0 font-semibold break-words hover:underline">
                      {team(f.home_team_id)} v {team(f.away_team_id)}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-muted">
                      {formatWatDateTime(f.scheduled_at)} <StatusBadge status={f.status as MatchStatus} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Competition actions">
            <div className="flex flex-wrap gap-2">
              <ConfirmAction
                action={recomputeAction}
                hidden={{ competition_id: c.id }}
                trigger="Recompute"
                triggerClass={btn.secondary}
                tone="primary"
                title="Recompute everything from results?"
                body="Standings, qualification, knockout advancement and suspensions are re-derived from match events. Safe to repeat."
                confirmLabel="Recompute"
              />
              {c.status !== "COMPLETED" ? (
                <ConfirmAction
                  action={completeCompetitionAction}
                  hidden={{ competition_id: c.id }}
                  trigger="Complete competition"
                  triggerClass={btn.primary}
                  tone="primary"
                  title={`Complete ${c.short_name}?`}
                  body="Needs every fixture played, cancelled or decided and — where the format has one — a champion determined by the results. Champion, runner-up and third place are derived, never typed."
                  confirmLabel="Complete competition"
                  typeToConfirm="COMPLETE"
                />
              ) : (
                <ConfirmAction
                  action={reopenCompetitionAction}
                  hidden={{ competition_id: c.id }}
                  trigger="Reopen"
                  title="Reopen this competition?"
                  body="Honours are cleared until it is completed again. This is an audited override."
                  confirmLabel="Reopen"
                  reason={{ label: "Reason", required: true }}
                />
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Current leaders">
            {tables.length === 0 ? (
              <p className="text-sm text-ink-muted">No table yet.</p>
            ) : (
              <ul className="space-y-3">
                {tables.flatMap((s) =>
                  (s.groups ?? []).map((g) => (
                    <li key={`${s.id}-${g.id ?? "league"}`}>
                      <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">{g.name ?? s.name}</p>
                      <ol className="mt-1 space-y-0.5 text-sm">
                        {g.rows.slice(0, 3).map((r) => (
                          <li key={r.team_id} className="flex justify-between gap-2">
                            <span className="min-w-0 break-words">
                              {r.rank}. {team(r.team_id)} {r.tied && <Badge tone="warn">level</Badge>}{" "}
                              {r.qualification === "QUALIFIED" && <Badge tone="ok">Q</Badge>}
                            </span>
                            <span className="font-bold tabular-nums">{r.points} pts</span>
                          </li>
                        ))}
                      </ol>
                    </li>
                  )),
                )}
              </ul>
            )}
          </Card>

          <Card title="Top scorers" description="From match events only (own goals and shoot-out kicks excluded).">
            {o.scorers.length === 0 ? (
              <p className="text-sm text-ink-muted">No goals recorded yet.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {o.scorers.slice(0, 5).map((p) => (
                  <li key={`${p.player_id}-${p.team_id}`} className="flex justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {p.name} <span className="text-xs text-ink-muted">{team(p.team_id)}</span>
                    </span>
                    <span className="font-bold tabular-nums">{p.goals}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Recent competition activity">
            {o.recent_activity.length === 0 ? (
              <p className="text-sm text-ink-muted">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {o.recent_activity.map((a, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span className="min-w-0 break-words">
                      {ACTION_LABEL[a.action] ?? a.action}
                      {typeof a.detail === "string" && <span className="text-ink-muted"> · {a.detail}</span>}
                    </span>
                    <span className="text-xs text-ink-muted">{formatWatDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
