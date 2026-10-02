import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CompetitionHeader } from "@/components/admin/CompetitionHeader";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { KnockoutGenerator } from "@/components/admin/KnockoutGenerator";
import { Badge, btn, Card, Empty, Field, inputCls, selectCls } from "@/components/admin/ui";
import {
  decideTieAction,
  qualificationDecisionAction,
  reconcileTieAction,
  resolveTieSideAction,
  scheduleTieAction,
} from "@/lib/admin/actions/engine";
import { getCompetitionOverview, teamNames, type TieView } from "@/lib/admin/data/engine";
import { listVenues } from "@/lib/admin/data/reference";
import { formatWatDateTime, toWatInput } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Knockout" };

const QUAL_TONE = { QUALIFIED: "ok", ELIMINATED: "muted", PENDING: "warn" } as const;

export default async function KnockoutPage({ params }: PageProps<"/admin/competitions/[id]/knockout">) {
  const { id } = await params;
  const [o, venues] = await Promise.all([getCompetitionOverview(id), listVenues()]);
  if (!o) notFound();
  const names = teamNames(o);
  const team = (tid: string | null, label: string) => (tid ? (names.get(tid)?.short_name ?? label) : label);
  const knockoutStages = o.stages.filter((s) => s.is_knockout);
  const firstKo = knockoutStages.find((s) => s.stage_type !== "THIRD_PLACE");
  const hasTies = knockoutStages.some((s) => (s.ties?.length ?? 0) > 0);
  const tableStages = o.stages.filter((s) => !s.is_knockout && (s.qualification.per_group || s.qualification.top || s.qualification.best_ranked));
  const hasGroups = o.stages.some((s) => s.stage_type === "GROUP");

  const tieCard = (t: TieView) => {
    const resultIn = t.status === "FT" || t.status === "CANCELLED" || t.status === "ABANDONED";
    const needsDecision = !t.winner_team_id && t.home_team_id && t.away_team_id && (resultIn || !t.match_id);
    return (
      <li key={t.id} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-extrabold">{t.code}</span>
          <span className="flex flex-wrap gap-1">
            {t.needs_reconciliation && <Badge tone="bad">needs reconciliation</Badge>}
            {t.winner_team_id && <Badge tone="ok">{team(t.winner_team_id, "")} advanced{t.decided_by === "PENALTIES" ? " (pens)" : t.decided_by === "ADMIN" ? " (decision)" : ""}</Badge>}
          </span>
        </div>
        <p className="mt-1 text-sm break-words">
          <span className={t.winner_team_id === t.home_team_id && t.home_team_id ? "font-bold" : ""}>{team(t.home_team_id, t.home_label)}</span>
          {t.home_score != null && t.status === "FT" ? ` ${t.home_score}–${t.away_score} ` : " v "}
          <span className={t.winner_team_id === t.away_team_id && t.away_team_id ? "font-bold" : ""}>{team(t.away_team_id, t.away_label)}</span>
          {t.home_pens != null && <span className="text-ink-muted"> ({t.home_pens}–{t.away_pens} pens)</span>}
        </p>
        <p className="text-xs text-ink-muted">
          {t.scheduled_at ? formatWatDateTime(t.scheduled_at) : "Kick-off not set"}
          {t.winner_to && ` · winner → ${t.winner_to.code}`}
          {t.loser_to && ` · loser → ${t.loser_to.code}`}
          {t.match_id && (
            <>
              {" · "}
              <Link href={`/admin/matches/${t.match_id}`} className="underline">
                match
              </Link>
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(!t.match_id || t.status === "SCHEDULED" || t.status === "POSTPONED") && (
            <Disclosure summary="Schedule">
              <ActionForm action={scheduleTieAction} className="grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="tie_id" value={t.id} />
                <Field scope={t.id} label="Kick-off (WAT)">
                  <input type="datetime-local" name="scheduled_at" required defaultValue={toWatInput(t.scheduled_at)} className={inputCls} />
                </Field>
                <Field scope={t.id} label="Venue">
                  <select name="venue_id" defaultValue={t.venue_id ?? ""} className={selectCls}>
                    <option value="">To be confirmed</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field scope={`${t.id}-r`} label="Reason (if rescheduling)" className="sm:col-span-2">
                  <input name="reason" maxLength={300} className={inputCls} />
                </Field>
                <Submit className={`${btn.primary} sm:justify-self-start`}>Save</Submit>
              </ActionForm>
            </Disclosure>
          )}
          {needsDecision && (
            <ConfirmAction
              action={decideTieAction}
              hidden={{ tie_id: t.id }}
              trigger="Decide tie"
              triggerClass={btn.small}
              tone="primary"
              title={`Decide ${t.code}`}
              body="For a tie that ended level without a shoot-out, a walkover, or a cancelled/abandoned tie (replay result, drawing of lots…). Audited."
              confirmLabel="Record decision"
              reason={{ label: "Reason", required: true }}
            >
              <label className="mt-3 block text-sm font-semibold">
                Winner
                <select name="winner_team_id" required className={`${selectCls} mt-1`}>
                  <option value={t.home_team_id!}>{team(t.home_team_id, t.home_label)}</option>
                  <option value={t.away_team_id!}>{team(t.away_team_id, t.away_label)}</option>
                </select>
              </label>
            </ConfirmAction>
          )}
          {t.needs_reconciliation && (
            <ConfirmAction
              action={reconcileTieAction}
              hidden={{ tie_id: t.id }}
              trigger="Reconcile bracket"
              triggerClass={btn.small}
              tone="primary"
              title={`Reconcile ${t.code}`}
              body="A corrected result changed the winner. Downstream ties and their unstarted matches are updated; refused if a later round already started."
              confirmLabel="Reconcile"
              reason={{ label: "Reason", required: true }}
            />
          )}
          {!t.match_id &&
            (["HOME", "AWAY"] as const)
              .filter((side) => !(side === "HOME" ? t.home_team_id : t.away_team_id))
              .map((side) => (
                <ConfirmAction
                  key={side}
                  action={resolveTieSideAction}
                  hidden={{ tie_id: t.id, side }}
                  trigger={`Place ${side === "HOME" ? t.home_label : t.away_label}`}
                  triggerClass={btn.small}
                  tone="primary"
                  title="Place a team manually"
                  body="Only when the competition rules require it (e.g. drawing of lots between teams still level). Normally the slot fills automatically."
                  confirmLabel="Place team"
                  reason={{ label: "Reason", required: true }}
                >
                  <label className="mt-3 block text-sm font-semibold">
                    Team
                    <select name="team_id" required className={`${selectCls} mt-1`}>
                      {o.entries.map((e) => (
                        <option key={e.team_id} value={e.team_id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </ConfirmAction>
              ))}
        </div>
      </li>
    );
  };

  return (
    <>
      <CompetitionHeader o={o} section="Knockout" />
      <div className="space-y-6">
        {tableStages.map((s) => (
          <Card key={s.id} title={`Qualification · ${s.name}`} description="Derived from final group standings. Teams level across the cut line stay PENDING until you record a decision.">
            <div className="grid gap-3 md:grid-cols-2">
              {(s.groups ?? []).map((g) => (
                <section key={g.id ?? "league"} aria-label={g.name ?? s.name} className="rounded-lg border border-line p-3">
                  <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">
                    {g.name ?? s.name} {g.complete ? "· complete" : "· in progress"}
                  </p>
                  <ol className="mt-1 space-y-1 text-sm">
                    {g.rows.map((r) => (
                      <li key={r.team_id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 break-words">
                          {r.rank}. {team(r.team_id, "—")} <span className="text-xs text-ink-muted">{r.points} pts</span> {r.tied && <Badge tone="warn">level</Badge>}
                        </span>
                        <span className="flex items-center gap-1">
                          {r.qualification && <Badge tone={QUAL_TONE[r.qualification]}>{r.qualification.toLowerCase()}</Badge>}
                          {(r.qualification === "PENDING" || r.tied) && g.complete && (
                            <ConfirmAction
                              action={qualificationDecisionAction}
                              hidden={{ stage_id: s.id, team_id: r.team_id }}
                              trigger="Decide"
                              triggerClass={btn.small}
                              tone="primary"
                              title={`Qualification of ${team(r.team_id, "")}`}
                              body="Record the result of a play-off, drawing of lots or another rule. Audited and reversible."
                              confirmLabel="Record"
                              reason={{ label: "Reason", required: true }}
                            >
                              <label className="mt-3 block text-sm font-semibold">
                                Decision
                                <select name="decision" className={`${selectCls} mt-1`}>
                                  <option value="QUALIFIED">Qualified</option>
                                  <option value="ELIMINATED">Eliminated</option>
                                  <option value="">Withdraw decision</option>
                                </select>
                              </label>
                            </ConfirmAction>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </Card>
        ))}

        {!firstKo ? (
          <Empty title="No knockout rounds">
            Add knockout stages (e.g. Semi-finals, Final, Third-place match) in{" "}
            <Link href={`/admin/competitions/${id}/setup`} className="underline">
              Setup
            </Link>
            .
          </Empty>
        ) : !hasTies ? (
          <Card title="Generate the knockout bracket" description={`Starting at ${firstKo.name}. Admins confirm before anything is created.`}>
            <KnockoutGenerator stageId={firstKo.id} hasGroups={hasGroups} hasThirdPlace={knockoutStages.some((s) => s.stage_type === "THIRD_PLACE")} />
          </Card>
        ) : (
          knockoutStages.map((s) => (
            <Card key={s.id} title={s.name} description={`${s.extra_time ? "Extra time" : "No extra time"} · ${s.penalties ? "penalties" : "no penalties"} when level`}>
              {(s.ties ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">No ties in this round.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">{(s.ties ?? []).map(tieCard)}</ul>
              )}
            </Card>
          ))
        )}
      </div>
    </>
  );
}
