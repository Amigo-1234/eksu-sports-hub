import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { RegistrationBadge, RejectPersonAction, ReviewActions } from "@/components/admin/Registration";
import { AdminDocumentUpload } from "@/components/admin/RegistrationIntake";
import { ScreeningBadge } from "@/components/admin/Screening";
import { Badge, btn, Card, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { updateRegistrationContact, updateRegistrationPerson } from "@/lib/admin/actions/registrations";
import { getIntakeOptions, getRegistration, type IntakeOptions, type RegistrationDetail, type RegistrationPerson } from "@/lib/admin/data/registrations";
import { formatWatDateTime } from "@/lib/admin/time";
import { LEVEL_LABEL, LEVELS, POSITION_LABEL, POSITIONS, STATUS_LABEL, type RegistrationStatus } from "@/lib/registration/rules";

export const metadata: Metadata = { title: "Registration" };
export const dynamic = "force-dynamic";

const PERSON_TONE = { SUBMITTED: "brand", ACCEPTED_FOR_SCREENING: "ok", REJECTED: "bad", WITHDRAWN: "muted" } as const;
const EVENT_LABEL: Record<string, string> = { EDITED: "Details corrected", DOCUMENT_ATTACHED: "Document attached" };
const eventLabel = (s: string) => STATUS_LABEL[s as RegistrationStatus] ?? EVENT_LABEL[s] ?? s;

function EditPerson({ p, registrationId, options, teams }: { p: RegistrationPerson; registrationId: string; options: IntakeOptions; teams: { id: string; name: string }[] }) {
  const f = (name: string, lbl: string, el: React.ReactNode) => (
    <label key={name} className="block min-w-0">
      <span className="mb-1 block text-xs font-bold">{lbl}</span>
      {el}
    </label>
  );
  return (
    <details className="mt-2 rounded-lg border border-line">
      <summary className="flex min-h-10 cursor-pointer items-center px-3 text-sm font-bold text-brand-700">Correct details</summary>
      <ActionForm action={updateRegistrationPerson} className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
        <input type="hidden" name="person_id" value={p.id} />
        <input type="hidden" name="registration_id" value={registrationId} />
        {f("full_name", "Full name", <input name="full_name" defaultValue={p.full_name} maxLength={80} required className={inputCls} />)}
        {f("matric_number", "Matric / student number", <input name="matric_number" defaultValue={p.matric_number} maxLength={40} required className={inputCls} />)}
        {f(
          "faculty_id",
          "Faculty",
          <select name="faculty_id" defaultValue={p.faculty.id} className={selectCls}>
            {options.faculties.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>,
        )}
        {f(
          "department_id",
          "Department",
          <select name="department_id" defaultValue={p.department?.id ?? ""} className={selectCls}>
            <option value="">— none —</option>
            {options.faculties
              .filter((x) => x.departments.length)
              .map((x) => (
                <optgroup key={x.id} label={x.name}>
                  {x.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>,
        )}
        {f(
          "level",
          "Level",
          <select name="level" defaultValue={p.level} className={selectCls}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>,
        )}
        {f(
          "position",
          "Position",
          <select name="position" defaultValue={p.position} className={selectCls}>
            {POSITIONS.map((x) => (
              <option key={x} value={x}>
                {x} · {POSITION_LABEL[x]}
              </option>
            ))}
          </select>,
        )}
        {f("phone", "Phone", <input name="phone" type="tel" defaultValue={p.phone ?? ""} maxLength={20} className={inputCls} />)}
        {teams.length > 0
          ? f(
              "team_id",
              "Team",
              <select name="team_id" defaultValue={p.team.id} className={selectCls}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>,
            )
          : null}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Submit className={btn.primary}>Save correction</Submit>
          <span className="text-xs text-ink-muted">The change is recorded in the history and audit log.</span>
        </div>
      </ActionForm>
    </details>
  );
}

function EditContact({ r }: { r: RegistrationDetail }) {
  return (
    <details className="mt-3 rounded-lg border border-line">
      <summary className="flex min-h-10 cursor-pointer items-center px-3 text-sm font-bold text-brand-700">Correct contact details</summary>
      <ActionForm action={updateRegistrationContact} className="space-y-3 border-t border-line p-3">
        <input type="hidden" name="registration_id" value={r.id} />
        <label className="block">
          <span className="mb-1 block text-xs font-bold">Name</span>
          <input name="name" defaultValue={r.submitter.name} maxLength={80} required className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold">Phone (used for the status check)</span>
          <input name="phone" type="tel" defaultValue={r.submitter.phone} maxLength={20} required className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold">Email (optional)</span>
          <input name="email" type="email" defaultValue={r.submitter.email ?? ""} maxLength={120} className={inputCls} />
        </label>
        <Submit className={btn.secondary}>Save contact</Submit>
      </ActionForm>
    </details>
  );
}

function DocumentLink({ url, label, isPdf }: { url: string | null | undefined; label: string; isPdf: boolean }) {
  if (!url)
    return <span className="grid h-28 w-28 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong px-2 text-center text-xs font-semibold text-ink-muted">No {label.toLowerCase()} yet</span>;
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

function Person({
  p,
  canDecide,
  canEdit,
  index,
  registrationId,
  options,
  teams,
}: {
  p: RegistrationPerson;
  canDecide: boolean;
  canEdit: boolean;
  index: number;
  registrationId: string;
  options: IntakeOptions;
  teams: { id: string; name: string }[];
}) {
  const editable = canEdit && p.status === "SUBMITTED";
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex gap-2">
          <DocumentLink url={p.photo_url} label="Photo" isPdf={false} />
          <DocumentLink url={p.id_url} label="ID evidence" isPdf={Boolean(p.id_path?.endsWith(".pdf"))} />
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
          {editable && (
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminDocumentUpload registrationId={registrationId} personId={p.id} kind="photo" has={Boolean(p.photo_path)} />
              <AdminDocumentUpload registrationId={registrationId} personId={p.id} kind="id" has={Boolean(p.id_path)} />
            </div>
          )}
          {editable && <EditPerson p={p} registrationId={registrationId} options={options} teams={teams} />}
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
  const [r, options] = await Promise.all([getRegistration(id), getIntakeOptions()]);
  if (!r) notFound();
  const teams = r.type === "TEAM_ROSTER" ? [] : (options.windows.find((w) => w.id === r.window.id)?.teams ?? []);
  const missingDocs = r.players.filter((p) => p.status === "SUBMITTED" && (!p.photo_path || !p.id_path)).length;
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
        {r.source === "ADMIN" && <Badge tone="neutral">Entered by {r.created_by ?? "an administrator"}</Badge>}
      </div>
      {missingDocs > 0 && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
          {missingDocs} entr{missingDocs === 1 ? "y has" : "ies have"} no passport photo or ID evidence yet. Attach them below if available, or verify identity at
          the physical screening.
        </p>
      )}
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
              <Person
                key={p.id}
                p={p}
                canDecide={open && r.type === "TEAM_ROSTER" && waiting > 1}
                canEdit={open}
                index={i + 1}
                registrationId={r.id}
                options={options}
                teams={teams}
              />
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
            {open && <EditContact r={r} />}
          </Card>
          <Card title="History">
            <ol className="space-y-2 text-sm">
              {r.history.map((h, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <p className="font-semibold">
                    {h.player ? `${h.player}: ` : ""}
                    {h.to === "EDITED" || h.to === "DOCUMENT_ATTACHED" ? "" : h.from ? `${eventLabel(h.from)} → ` : ""}
                    {eventLabel(h.to)}
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
