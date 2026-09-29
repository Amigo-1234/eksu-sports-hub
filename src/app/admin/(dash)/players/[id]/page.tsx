import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { Disclosure } from "@/components/admin/Disclosure";
import { EligibilityBadge, ScreeningActions, ScreeningBadge } from "@/components/admin/Screening";
import { Badge, btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { openScreening, updatePlayer } from "@/lib/admin/actions/players";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { getPlayerDetail } from "@/lib/admin/data/players";
import { listFaculties, listSeasons } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Player" };

const TRANSITION: Record<string, string> = {
  PENDING: "Pending",
  CLEARED: "Cleared",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

export default async function PlayerPage({ params, searchParams }: PageProps<"/admin/players/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const registered = sp.registered === "1";
  const notice = typeof sp.notice === "string" ? sp.notice.slice(0, 200) : "";
  const [detail, teams, seasons, faculties, competitions] = await Promise.all([
    getPlayerDetail(id),
    listTeamRefs(),
    listSeasons(),
    listFaculties(),
    listCompetitionOptions(),
  ]);
  if (!detail) notFound();
  const { player, screenings, squads, lineups } = detail;
  const name = player.name ?? "Unnamed player";
  const activeSquad = squads.find((s) => s.active);
  const cleared = screenings.some((s) => s.status === "CLEARED" && !s.competition);
  const stages: [string, boolean, string][] = [
    ["Registered player", true, formatWatDateTime(player.created_at)],
    ["Screened player", cleared, cleared ? "Cleared" : screenings.length ? "Not cleared" : "No screening"],
    ["Squad player", !!activeSquad, activeSquad ? `${activeSquad.team.short_name} #${activeSquad.shirt_number}` : "Not in a squad"],
    ["Match line-up player", lineups.length > 0, lineups.length ? `${lineups.length} line-up${lineups.length > 1 ? "s" : ""}` : "Not selected yet"],
  ];

  return (
    <>
      <PageTitle
        title={name}
        back={{ href: "/admin/players", label: "Players" }}
        description={[player.department, player.faculty].filter(Boolean).join(" · ") || "Faculty not recorded"}
      />
      <p role="status" className="empty:hidden">
        {notice && <span className="mb-4 block rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">{notice}</span>}
      </p>
      {registered && (
        <p className="mb-4 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">
          Player registered. Screening is pending: record the decision below.
        </p>
      )}

      <ol className="mb-6 grid gap-2 sm:grid-cols-4" aria-label="Player status">
        {stages.map(([label, done, detailText]) => (
          <li key={label} className={`rounded-lg border px-3 py-2 ${done ? "border-win/40 bg-win/10" : "border-line bg-surface"}`}>
            <p className="text-sm font-extrabold uppercase">
              <span aria-hidden="true">{done ? "✓ " : "○ "}</span>
              {label}
            </p>
            <p className="text-xs text-ink-muted">{detailText}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Screening" id="screening" description="One decision per team and season (optionally one competition). History is never overwritten.">
            {screenings.length === 0 ? (
              <Empty title="No screening yet" />
            ) : (
              <ul className="space-y-4">
                {screenings.map((s) => {
                  const scope = `${s.team.short_name} · ${s.season.name}${s.competition ? ` · ${s.competition.name}` : ""}`;
                  return (
                    <li key={s.id} id={`screening-${s.id}`} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          <ScreeningBadge status={s.status} />
                          {scope}
                        </p>
                        {s.competition && <Badge tone="muted">Competition restriction</Badge>}
                      </div>
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-ink-muted">Decided</dt>
                          <dd>{s.decided_at ? `${formatWatDateTime(s.decided_at)}${s.decided_by ? ` by ${s.decided_by}` : ""}` : "Not yet"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">Screening date</dt>
                          <dd>{s.screened_on ?? "—"}</dd>
                        </div>
                        {s.reason && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-ink-muted">Reason</dt>
                            <dd className="break-words">{s.reason}</dd>
                          </div>
                        )}
                        {s.notes && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-ink-muted">Notes</dt>
                            <dd className="break-words">{s.notes}</dd>
                          </div>
                        )}
                      </dl>
                      <div className="mt-3">
                        <ScreeningActions id={s.id} status={s.status} player={name} scope={scope} returnTo={`/admin/players/${player.id}`} />
                      </div>
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer font-semibold text-brand-700">Decision history ({s.history.length})</summary>
                        <ol className="mt-2 space-y-2 border-l-2 border-line pl-3">
                          {s.history.map((h, i) => (
                            <li key={i}>
                              <p className="font-semibold">
                                {h.from ? `${TRANSITION[h.from]} → ${TRANSITION[h.to]}` : `Opened as ${TRANSITION[h.to].toLowerCase()}`}
                              </p>
                              <p className="text-xs text-ink-muted">
                                {formatWatDateTime(h.at)} · {h.by ?? "system"}
                                {h.screened_on ? ` · screened ${h.screened_on}` : ""}
                              </p>
                              {h.reason && <p className="text-xs break-words">Reason: {h.reason}</p>}
                              {h.notes && <p className="text-xs break-words text-ink-muted">Notes: {h.notes}</p>}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
            <Disclosure summary="Open another screening (new season, new team, or a competition restriction)" className="mt-4">
              <ActionForm action={openScreening}>
                <input type="hidden" name="player_id" value={player.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Team">
                    <select name="team_id" required defaultValue="" className={selectCls}>
                      <option value="" disabled>
                        Choose
                      </option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Season">
                    <select name="season_id" required defaultValue={seasons.find((s) => s.is_current)?.id ?? ""} className={selectCls}>
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Competition (optional)">
                    <select name="competition_id" defaultValue="" className={selectCls}>
                      <option value="">Whole season</option>
                      {competitions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.season}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  A competition screening can only add a restriction: the player also needs a CLEARED season screening for that team.
                </p>
                <Submit className={`${btn.primary} mt-3`}>Open screening</Submit>
              </ActionForm>
            </Disclosure>
          </Card>

          <Card title="Squad membership" description="Memberships are deactivated, never deleted, so history stays reproducible.">
            {squads.length === 0 ? (
              <Empty title="Not in any squad">
                Once cleared, add the player from the{" "}
                <Link href="/admin/squads" className="font-semibold text-brand-700 underline">
                  squad page
                </Link>
                .
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {squads.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="w-10 font-display text-xl font-extrabold tabular-nums">{q.shirt_number}</span>
                    <Link href={`/admin/squads?team=${q.team.id}&season=${q.season.id}`} className="min-w-0 flex-1 font-semibold text-brand-700 hover:underline">
                      {q.team.name} · {q.season.name}
                    </Link>
                    {q.position && <Badge tone="muted">{q.position}</Badge>}
                    {q.captain && <Badge tone="warn">Captain</Badge>}
                    {q.active ? <EligibilityBadge status={q.eligibility} /> : <Badge tone="muted">Left {q.left_at ? formatWatDateTime(q.left_at) : ""}</Badge>}
                    {!q.active && q.left_reason && <span className="w-full pl-12 text-xs text-ink-muted">Reason: {q.left_reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Match line-ups">
            {lineups.length === 0 ? (
              <Empty title="Not selected for a match yet" />
            ) : (
              <ul className="divide-y divide-line">
                {lineups.map((l) => (
                  <li key={l.match_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/admin/matches/${l.match_id}`} className="min-w-0 flex-1 font-semibold text-brand-700 hover:underline">
                      {l.team} v {l.opponent} · {formatWatDateTime(l.scheduled_at)}
                    </Link>
                    <Badge tone="muted">
                      {l.role === "STARTER" ? "Starter" : "Sub"} #{l.shirt_number}
                    </Badge>
                    {l.captain && <Badge tone="warn">Captain</Badge>}
                    <Badge tone={l.lineup_status === "CONFIRMED" ? "ok" : "neutral"}>{l.lineup_status === "CONFIRMED" ? "Confirmed" : "Draft"}</Badge>
                    {l.match_status === "SCHEDULED" && l.eligibility !== "CLEARED" && <EligibilityBadge status={l.eligibility} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Private details" description="Visible to administrators only. Never shown publicly or to operators.">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Student / matric number</dt>
                <dd className="font-mono font-bold break-all">{player.student_id ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Registered</dt>
                <dd>
                  {formatWatDateTime(player.created_at)}
                  {player.registered_by ? ` by ${player.registered_by}` : ""}
                </dd>
              </div>
            </dl>
            <Disclosure summary="Edit details" className="mt-3">
              <ActionForm action={updatePlayer}>
                <input type="hidden" name="player_id" value={player.id} />
                <div className="space-y-3">
                  <Field label="Player name" scope={player.id}>
                    <input name="display_name" required maxLength={80} defaultValue={player.name ?? ""} className={inputCls} />
                  </Field>
                  <Field label="Student / matric number" scope={player.id}>
                    <input name="student_id" required maxLength={40} defaultValue={player.student_id ?? ""} className={inputCls} autoComplete="off" />
                  </Field>
                  <Field label="Department" scope={player.id}>
                    <select name="department_id" defaultValue={player.department_id ?? ""} className={selectCls}>
                      <option value="">Not recorded</option>
                      {faculties.map((f) => (
                        <optgroup key={f.id} label={f.name}>
                          {f.departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field label="Faculty" scope={player.id}>
                    <select name="faculty_id" defaultValue={player.faculty_id ?? ""} className={selectCls}>
                      <option value="">From department / not recorded</option>
                      {faculties.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Submit className={`${btn.primary} mt-3`}>Save details</Submit>
              </ActionForm>
            </Disclosure>
          </Card>
          <Card title="Match eligibility">
            <p className="text-sm text-ink-muted">A player can be picked for a match only when all of these hold:</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>{cleared ? "✓" : "✗"} Season screening CLEARED for the team</li>
              <li>{activeSquad ? "✓" : "✗"} Active member of that team&apos;s season squad</li>
              <li>• No pending/rejected/suspended screening for the match&apos;s competition</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
