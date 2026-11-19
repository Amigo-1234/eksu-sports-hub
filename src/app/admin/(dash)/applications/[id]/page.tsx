import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { InviteApplicantForm } from "@/components/admin/InviteApplicantForm";
import { Badge, btn, Card, Field, inputCls, PageTitle } from "@/components/admin/ui";
import { reviewApplication, saveApplicationNotes } from "@/lib/admin/actions/applications";
import { getApplication, listPracticeLinks } from "@/lib/admin/data/applications";
import { PracticeLinks } from "@/components/admin/PracticeLinks";
import { siteOriginForLinks } from "@/lib/admin/links";
import { formatWatDateTime, serverNow } from "@/lib/admin/time";
import Link from "next/link";
import { dayLabel, periodLabel, QUESTIONS, STATUS_LABEL, STATUS_TONE as TONE } from "@/lib/operator-applications/shared";

export const metadata: Metadata = { title: "Application" };

function Answer({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="text-sm font-bold">{q}</dt>
      <dd className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-ink-muted">{a || "—"}</dd>
    </div>
  );
}

export default async function ApplicationPage({ params }: PageProps<"/admin/applications/[id]">) {
  const a = await getApplication((await params).id);
  if (!a) notFound();
  const [practice, origin] = await Promise.all([listPracticeLinks(a.id), siteOriginForLinks().catch(() => "")]);
  const decisions = [
    { status: "SHORTLISTED", label: "Shortlist", cls: btn.secondary },
    { status: "APPROVED", label: "Approve", cls: btn.primary },
    { status: "REJECTED", label: "Reject", cls: btn.secondary },
    { status: "NEW", label: "Move back to New", cls: btn.small },
  ].filter((d) => d.status !== a.status);

  return (
    <>
      <PageTitle
        title={a.full_name}
        back={{ href: "/admin/applications", label: "Operator Applications" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            {a.reference} · applied {formatWatDateTime(a.created_at)}
            {a.reviewed_at && <> · reviewed {formatWatDateTime(a.reviewed_at)}</>}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card title="Contact & availability">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-bold">Email</dt><dd className="break-all"><a href={`mailto:${a.email}`} className="text-brand-700 underline">{a.email}</a></dd></div>
              <div><dt className="font-bold">Phone / WhatsApp</dt><dd>{a.phone ? <a href={`https://wa.me/${a.phone.replace(/^\+?0/, "234").replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{a.phone}</a> : "—"}</dd></div>
              <div><dt className="font-bold">Department / level</dt><dd>{[a.department, a.level].filter(Boolean).join(" · ") || "—"}</dd></div>
              <div><dt className="font-bold">Attends matches in person</dt><dd>{a.can_attend ? "Yes" : <span className="font-bold text-warn">No</span>}</dd></div>
              <div><dt className="font-bold">Days</dt><dd>{a.available_days.map(dayLabel).join(", ")}</dd></div>
              <div><dt className="font-bold">Times</dt><dd>{a.periods.map(periodLabel).join(", ")}</dd></div>
            </dl>
          </Card>
          <Card title="Experience & answers">
            <dl className="space-y-4">
              <Answer q="Experience officiating or reporting football" a={a.experience} />
              <Answer q={QUESTIONS.why} a={a.answer_why} />
              <Answer q={QUESTIONS.wrongGoal} a={a.answer_wrong_goal} />
              <Answer q={QUESTIONS.offline} a={a.answer_offline} />
              <Answer q={QUESTIONS.commit} a={a.commits_accuracy ? "Yes" : "No"} />
            </dl>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Practice test"
            description="Send a private link: the applicant officiates a mock match in the real console (nothing reaches real matches) and submits a score out of 100. Grants nothing."
          >
            <PracticeLinks applicationId={a.id} firstName={a.full_name.trim().split(/\s+/)[0]} phone={a.phone} origin={origin} links={practice} now={serverNow()} />
          </Card>

          {a.status !== "INVITED" && (
            <Card title="Decision" description="Reviewing never grants any access.">
              <div className="flex flex-wrap gap-2">
                {decisions.map((d) => (
                  <ActionForm key={d.status} action={reviewApplication}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="status" value={d.status} />
                    <Submit className={d.cls} pendingLabel="Saving…">{d.label}</Submit>
                  </ActionForm>
                ))}
              </div>
            </Card>
          )}

          {a.status === "APPROVED" && (
            <Card title="Invite as operator" description="Separate, explicit step: creates their operator account and a one-time set-up link. Assign matches afterwards as usual (PRIMARY / BACKUP).">
              <InviteApplicantForm id={a.id} name={a.full_name} email={a.email} />
            </Card>
          )}
          {a.status === "INVITED" && (
            <Card title="Invited">
              <p className="text-sm">
                Invited {a.invited_at ? formatWatDateTime(a.invited_at) : ""}. Manage their account, roles and access under{" "}
                <Link href="/admin/staff" className="font-semibold text-brand-700 underline">Staff &amp; Operators</Link>.
              </p>
            </Card>
          )}

          <Card title="Private review notes" description="Only administrators can see these.">
            <ActionForm action={saveApplicationNotes}>
              <input type="hidden" name="id" value={a.id} />
              <Field scope={a.id} label="Notes">
                <textarea name="review_notes" rows={6} maxLength={4000} defaultValue={a.review_notes} className={`${inputCls} h-auto py-2`} />
              </Field>
              <Submit className={`${btn.secondary} mt-3 w-full`}>Save notes</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
