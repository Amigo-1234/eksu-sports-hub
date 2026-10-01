import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationBadge, RejectPersonAction, ReviewActions } from "@/components/admin/Registration";
import { ScreeningBadge } from "@/components/admin/Screening";
import { Badge, Card, PageTitle } from "@/components/admin/ui";
import { getRegistration, type RegistrationPerson } from "@/lib/admin/data/registrations";
import { formatWatDateTime } from "@/lib/admin/time";
import { LEVEL_LABEL, POSITION_LABEL, STATUS_LABEL, type RegistrationStatus } from "@/lib/registration/rules";

export const metadata: Metadata = { title: "Registration" };
export const dynamic = "force-dynamic";

const PERSON_TONE = { SUBMITTED: "brand", ACCEPTED_FOR_SCREENING: "ok", REJECTED: "bad", WITHDRAWN: "muted" } as const;

function DocumentLink({ url, label, isPdf }: { url: string | null | undefined; label: string; isPdf: boolean }) {
  if (!url) return <span className="text-xs font-semibold text-loss">{label}: missing</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group block w-28 shrink-0" title={`${label} (link expires in 10 minutes)`}>
      {isPdf ? (
        <span className="grid h-28 w-28 place-items-center rounded-lg border border-line bg-subtle text-sm font-bold text-ink-muted group-hover:bg-brand-50">PDF</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private file
        <img src={url} alt={label} className="h-28 w-28 rounded-lg border border-line object-cover group-hover:opacity-90" referrerPolicy="no-referrer" />
      )}
      <span className="mt-1 block text-xs font-semibold text-brand-700 group-hover:underline">{label} ↗</span>
    </a>
  );
}

function Person({ p, canDecide, index, registrationId }: { p: RegistrationPerson; canDecide: boolean; index: number; registrationId: string }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex gap-2">
          <DocumentLink url={p.photo_url} label="Photo" isPdf={false} />
          <DocumentLink url={p.id_url} label="ID evidence" isPdf={p.id_path.endsWith(".pdf")} />
        </div>
        <div className="min-w-0 flex-[1_1_14rem] space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-ink-faint">{index}.</span>
            <span className="font-bold">{p.full_name}</span>
            <Badge tone={PERSON_TONE[p.status]}>{STATUS_LABEL[p.status as RegistrationStatus] ?? p.status}</Badge>
          </p>
          <p className="font-mono text-xs break-all">{p.matric_number}</p>
          <p className="text-xs text-ink-muted">
            {[p.department?.name, p.faculty.name].filter(Boolean).join(" · ")} · {LEVEL_LABEL[p.level as keyof typeof LEVEL_LABEL] ?? p.level}
          </p>
          <p className="text-xs text-ink-muted">
            {p.team.name} · {POSITION_LABEL[p.position as keyof typeof POSITION_LABEL] ?? p.position}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
          {p.status_reason && <p className="text-xs">Reason: {p.status_reason}</p>}
          {p.duplicates.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-warn/40 bg-warn-soft px-2.5 py-1.5 text-xs font-semibold text-warn">
              {p.duplicates.map((d, i) => (
                <li key={i}>
                  ⚠ {d.detail}
                  {d.kind === "OFFICIAL_PLAYER" && d.player_id && (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/admin/players/${d.player_id}`} className="underline">
                        view player
                      </Link>{" "}
                      (accepting links to this record)
                    </>
                  )}
                  {d.registration_id && (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/admin/registrations/${d.registration_id}`} className="underline">
                        open
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {p.official_player && (
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-muted">Player record:</span>
              <Link href={`/admin/players/${p.official_player.id}`} className="font-bold text-brand-700 hover:underline">
                {p.official_player.name ?? "Player"}
              </Link>
              {p.screening && (
                <>
                  <span className="text-ink-muted">· Screening:</span>
                  <ScreeningBadge status={p.screening.status} />
                </>
              )}
            </p>
          )}
        </div>
        {canDecide && p.status === "SUBMITTED" && <RejectPersonAction id={p.id} name={p.full_name} registrationId={registrationId} />}
      </div>
    </li>
  );
}

export default async function RegistrationPage({ params, searchParams }: PageProps<"/admin/registrations/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const notice = typeof sp.notice === "string" ? sp.notice.slice(0, 240) : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getRegistration(id);
  if (!r) notFound();
  const open = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_CORRECTION"].includes(r.status);
  const waiting = r.players.filter((p) => p.status === "SUBMITTED").length;
  return (
    <>
      <PageTitle
        title={r.reference}
        description={`${r.type === "TEAM_ROSTER" ? "Team roster" : "Individual player"} · ${r.competition.name} · ${r.season.name}`}
        back={{ href: "/admin/registrations", label: "Registrations" }}
      />
      <p role="status" className="empty:hidden">
        {notice && <span className="mb-4 block rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">{notice}</span>}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-muted">Registration status:</span>
        <RegistrationBadge status={r.status} />
        {r.status_reason && <span className="text-sm">— {r.status_reason}</span>}
      </div>
      {r.status === "ACCEPTED_FOR_SCREENING" && (
        <p className="mb-4 rounded-lg border border-line bg-subtle px-3 py-2 text-sm">
          Accepted for screening. Eligibility is decided separately on each player&apos;s screening (see the screening status below, or the{" "}
          <Link href="/admin/screening" className="font-semibold underline">
            screening queue
          </Link>
          ).
        </p>
      )}
      {open && (
        <Card className="mb-4" title="Decision" description={`${waiting} player${waiting === 1 ? "" : "s"} waiting. Every decision is recorded in the history and audit log.`}>
          <ReviewActions id={r.id} status={r.status} reference={r.reference} accepting={waiting} />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={`${r.type === "TEAM_ROSTER" ? "Roster" : "Player"} · ${r.players.length}`} description="Documents open as private links that expire after 10 minutes.">
          <ol className="divide-y divide-line">
            {r.players.map((p, i) => (
              <Person key={p.id} p={p} canDecide={open && r.type === "TEAM_ROSTER" && waiting > 1} index={i + 1} registrationId={r.id} />
            ))}
          </ol>
        </Card>
        <div className="space-y-4">
          <Card title="Submission">
            <dl className="space-y-1.5 text-sm">
              {(
                [
                  ["Submitted by", r.submitter.name],
                  ["Phone", r.submitter.phone],
                  ["Email", r.submitter.email ?? "—"],
                  ["Team", r.team?.name ?? r.players[0]?.team.name ?? "—"],
                  ["Window", r.window.title],
                  ["Submitted", formatWatDateTime(r.submitted_at)],
                  ["Last reviewed", r.reviewed_at ? `${formatWatDateTime(r.reviewed_at)}${r.reviewed_by ? ` by ${r.reviewed_by}` : ""}` : "—"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="font-semibold break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {r.admin_notes && <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-sm whitespace-pre-line">{r.admin_notes}</p>}
          </Card>
          <Card title="History">
            <ol className="space-y-2 text-sm">
              {r.history.map((h, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <p className="font-semibold">
                    {h.player ? `${h.player}: ` : ""}
                    {h.from ? `${STATUS_LABEL[h.from as RegistrationStatus] ?? h.from} → ` : ""}
                    {STATUS_LABEL[h.to as RegistrationStatus] ?? h.to}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatWatDateTime(h.at)} · {h.by ?? "Applicant"}
                  </p>
                  {h.reason && <p className="text-xs">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
