import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CompetitionHeader } from "@/components/admin/CompetitionHeader";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Disclosure } from "@/components/admin/Disclosure";
import { Badge, btn, Card, Check, Field, inputCls, selectCls, TableWrap, td, th } from "@/components/admin/ui";
import { addSuspensionAction, cancelSuspensionAction, disciplineRulesAction } from "@/lib/admin/actions/engine";
import { adminDb } from "@/lib/admin/data/db";
import { getCompetitionOverview, teamNames } from "@/lib/admin/data/engine";

export const metadata: Metadata = { title: "Discipline" };

const REASON: Record<string, string> = {
  RED_CARD: "Straight red card",
  SECOND_YELLOW: "Second-yellow red",
  YELLOW_ACCUMULATION: "Yellow-card accumulation",
  ADMIN: "Admin decision",
};

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are mapped explicitly below. */
async function squadPlayers(competitionId: string, teamIds: string[]) {
  if (teamIds.length === 0) return [];
  const { db } = await adminDb();
  const { data: comp } = await db.from("competitions").select("season_id").eq("id", competitionId).maybeSingle();
  if (!comp) return [];
  const { data } = await db
    .from("squad_players")
    .select("player_id, shirt_number, active, player:players(display_name), squad:squads!inner(team_id, season_id)")
    .eq("squad.season_id", (comp as any).season_id)
    .in("squad.team_id", teamIds)
    .order("shirt_number");
  return ((data ?? []) as any[]).map((r) => ({
    team_id: r.squad.team_id as string,
    player_id: r.player_id as string,
    shirt: r.shirt_number as number,
    name: (r.player?.display_name as string | null) ?? null,
  }));
}

export default async function DisciplinePage({ params }: PageProps<"/admin/competitions/[id]/discipline">) {
  const { id } = await params;
  const o = await getCompetitionOverview(id);
  if (!o) notFound();
  const names = teamNames(o);
  const team = (tid: string) => names.get(tid)?.short_name ?? "—";
  const r = o.discipline.rules;
  const players = await squadPlayers(id, o.entries.map((e) => e.team_id));
  const suspensions = o.discipline.suspensions;

  return (
    <>
      <CompetitionHeader o={o} section="Discipline" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card
            title="Rules"
            description="Automatic suspensions from cards in this competition's completed official matches. Off by default; existing results are re-evaluated when you save."
          >
            <ActionForm action={disciplineRulesAction} className="space-y-3">
              <input type="hidden" name="competition_id" value={id} />
              <Check name="enabled" label="Apply automatic suspensions" defaultChecked={r?.enabled ?? false} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Straight red → matches">
                  <input type="number" name="red_card_matches" min={0} max={10} required defaultValue={r?.red_card_matches ?? 1} className={inputCls} />
                </Field>
                <Field label="Second-yellow red → matches">
                  <input type="number" name="second_yellow_matches" min={0} max={10} required defaultValue={r?.second_yellow_matches ?? 1} className={inputCls} />
                </Field>
                <Field label="Every N yellow cards" hint="Empty: no accumulation">
                  <input type="number" name="yellow_threshold" min={2} max={10} defaultValue={r?.yellow_threshold ?? ""} className={inputCls} />
                </Field>
                <Field label="… → matches">
                  <input type="number" name="yellow_suspension_matches" min={1} max={10} required defaultValue={r?.yellow_suspension_matches ?? 1} className={inputCls} />
                </Field>
              </div>
              <p className="text-xs text-ink-muted">
                A suspension is served by the team&apos;s next completed fixtures in this competition. Postponed, cancelled or abandoned fixtures never count.
              </p>
              <Submit className={btn.primary}>Save rules</Submit>
            </ActionForm>
          </Card>

          <Card title="Alerts">
            {o.discipline_alerts.length === 0 ? (
              <p className="text-sm text-ink-muted">No alerts.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {o.discipline_alerts.map((a, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span className="min-w-0 break-words">
                      {a.name} <span className="text-xs text-ink-muted">{team(a.team_id)}</span>
                    </span>
                    <span className="text-xs">
                      {a.kind === "SUSPENDED" ? <Badge tone="bad">suspended · {a.remaining} left</Badge> : <Badge tone="warn">{a.detail} · one away</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Suspensions" description="History is never deleted: a cancelled suspension keeps its reason.">
            {suspensions.length === 0 ? (
              <p className="text-sm text-ink-muted">No suspensions.</p>
            ) : (
              <TableWrap label="Suspensions">
                <table className="w-full min-w-[34rem]">
                  <thead>
                    <tr>
                      <th className={th}>Player</th>
                      <th className={th}>Reason</th>
                      <th className={th}>Served</th>
                      <th className={th}>Status</th>
                      <th className={th}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {suspensions.map((s) => (
                      <tr key={s.id}>
                        <td className={td}>
                          {s.name} <span className="text-xs text-ink-muted">{team(s.team_id)}</span>
                        </td>
                        <td className={td}>{REASON[s.reason]}</td>
                        <td className={`${td} tabular-nums`}>
                          {s.matches_served}/{s.matches_total}
                        </td>
                        <td className={td}>
                          <Badge tone={s.status === "ACTIVE" ? "bad" : "ok"}>{s.status.toLowerCase()}</Badge>
                        </td>
                        <td className={td}>
                          {s.status === "ACTIVE" && (
                            <ConfirmAction
                              action={cancelSuspensionAction}
                              hidden={{ suspension_id: s.id }}
                              trigger="Cancel"
                              triggerClass={btn.small}
                              title={`Cancel ${s.name}'s suspension?`}
                              body="For a successful appeal or a mistaken card. The record stays with the reason."
                              confirmLabel="Cancel suspension"
                              reason={{ label: "Reason", required: true }}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <Disclosure summary="Add a suspension manually" className="mt-3">
              <ActionForm action={addSuspensionAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="competition_id" value={id} />
                <Field label="Player" className="sm:col-span-2">
                  <select name="player" required className={selectCls}>
                    <option value="">Choose a player…</option>
                    {o.entries.map((e) => (
                      <optgroup key={e.team_id} label={e.name}>
                        {players
                          .filter((p) => p.team_id === e.team_id)
                          .map((p) => (
                            <option key={p.player_id} value={`${e.team_id}:${p.player_id}`}>
                              No. {p.shirt}
                              {p.name ? ` · ${p.name}` : ""}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="Matches">
                  <input type="number" name="matches" min={1} max={20} required defaultValue={1} className={inputCls} />
                </Field>
                <Field label="Reason">
                  <input name="reason" required maxLength={300} className={inputCls} />
                </Field>
                <Submit className={`${btn.primary} sm:justify-self-start`}>Add suspension</Submit>
              </ActionForm>
            </Disclosure>
          </Card>

          <Card title="Cards">
            {o.discipline.players.length === 0 ? (
              <p className="text-sm text-ink-muted">No cards in this competition yet.</p>
            ) : (
              <TableWrap label="Cards per player">
                <table className="w-full min-w-[26rem]">
                  <thead>
                    <tr>
                      <th className={th}>Player</th>
                      <th className={th}>Yellow</th>
                      <th className={th}>2nd yellow</th>
                      <th className={th}>Red</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {o.discipline.players.map((p) => (
                      <tr key={`${p.player_id}-${p.team_id}`}>
                        <td className={td}>
                          {p.name} <span className="text-xs text-ink-muted">{team(p.team_id)}</span>
                        </td>
                        <td className={`${td} tabular-nums`}>{p.yellows}</td>
                        <td className={`${td} tabular-nums`}>{p.second_yellows}</td>
                        <td className={`${td} tabular-nums`}>{p.reds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
