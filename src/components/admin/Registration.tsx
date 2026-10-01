import { acceptRegistration, rejectRegistrationPlayer, reviewRegistration } from "@/lib/admin/actions/registrations";
import type { RegistrationWindow, WindowStatus } from "@/lib/admin/data/registrations";
import { toWatInput } from "@/lib/admin/time";
import { STATUS_LABEL, type RegistrationStatus } from "@/lib/registration/rules";
import { ConfirmAction } from "./ConfirmAction";
import { Badge, btn, Check, Field, inputCls } from "./ui";

const TONE: Record<RegistrationStatus, "neutral" | "warn" | "ok" | "bad" | "brand" | "muted"> = {
  DRAFT: "muted",
  SUBMITTED: "brand",
  UNDER_REVIEW: "neutral",
  NEEDS_CORRECTION: "warn",
  ACCEPTED_FOR_SCREENING: "ok",
  REJECTED: "bad",
  WITHDRAWN: "muted",
};

/** Registration status (never to be confused with screening status, shown separately). */
export function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status] ?? status}</Badge>;
}

const WINDOW_TONE: Record<WindowStatus, "neutral" | "ok" | "muted" | "warn"> = { DRAFT: "neutral", OPEN: "ok", CLOSED: "warn", ARCHIVED: "muted" };
export function WindowBadge({ w }: { w: Pick<RegistrationWindow, "status" | "open_now"> }) {
  if (w.status === "OPEN" && !w.open_now) return <Badge tone="warn">Open · outside dates</Badge>;
  return <Badge tone={WINDOW_TONE[w.status]}>{w.status === "OPEN" ? "Open · accepting" : w.status.toLowerCase()}</Badge>;
}

/** Shared fields of the create/edit window forms. Times are campus time (WAT). */
export function WindowFields({ w, suggest }: { w?: RegistrationWindow; suggest?: { slug: string; code: string } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Title" className="sm:col-span-2">
        <input name="title" required maxLength={120} defaultValue={w?.title ?? ""} className={inputCls} placeholder="e.g. Freshers Cup 2026 — player registration" />
      </Field>
      <Field label="Link name" hint="Public address: /register/<link name>. Lower-case letters, numbers, hyphens.">
        <input name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={w?.slug ?? suggest?.slug ?? ""} className={inputCls} />
      </Field>
      <Field label="Reference code" hint="Middle of every reference, e.g. FC26 → EKSU-FC26-7K4P2D.">
        <input name="reference_code" required maxLength={6} pattern="[A-Za-z0-9]{2,6}" defaultValue={w?.reference_code ?? suggest?.code ?? ""} className={`${inputCls} uppercase`} />
      </Field>
      <Field label="Opens (WAT)">
        <input type="datetime-local" name="opens_at" required defaultValue={toWatInput(w?.opens_at ?? new Date().toISOString())} className={inputCls} />
      </Field>
      <Field label="Closes (WAT, optional)">
        <input type="datetime-local" name="closes_at" defaultValue={toWatInput(w?.closes_at)} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Check name="allow_player" label="Players can register themselves" defaultChecked={w?.allow_player ?? true} />
        <Check name="allow_team" label="Captains / managers can register a team roster" defaultChecked={w?.allow_team ?? true} />
      </div>
      <Field label="Instructions shown to applicants (optional)" className="sm:col-span-2">
        <textarea name="instructions" rows={4} maxLength={4000} defaultValue={w?.instructions ?? ""} className={`${inputCls} h-auto py-2`} />
      </Field>
    </div>
  );
}

/** Review decisions for a registration that is still awaiting one. */
export function ReviewActions({ id, status, reference, accepting }: { id: string; status: RegistrationStatus; reference: string; accepting: number }) {
  if (!["SUBMITTED", "UNDER_REVIEW", "NEEDS_CORRECTION"].includes(status)) return null;
  const hidden = (s?: string) => ({ registration_id: id, ...(s ? { status: s } : {}) });
  return (
    <div className="flex flex-wrap gap-2">
      {accepting > 0 && (
        <ConfirmAction
          action={acceptRegistration}
          hidden={hidden()}
          trigger="Accept for screening"
          triggerClass={btn.primary}
          tone="primary"
          title={`Accept ${reference} for screening?`}
          body={
            <>
              {accepting} player{accepting === 1 ? "" : "s"} will get an official player record (or be linked to their existing one) and a{" "}
              <strong>PENDING</strong> screening. Nobody becomes eligible: each player must still be screened and cleared.
            </>
          }
          confirmLabel="Accept for screening"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Notes (optional, private)</span>
            <textarea name="notes" rows={2} maxLength={1000} className={`${inputCls} h-auto py-2`} />
          </label>
        </ConfirmAction>
      )}
      {status !== "UNDER_REVIEW" && (
        <ConfirmAction
          action={reviewRegistration}
          hidden={hidden("UNDER_REVIEW")}
          trigger="Mark under review"
          triggerClass={btn.secondary}
          tone="primary"
          title="Mark as under review?"
          body="Shows the applicant that the Sports Directorate is reviewing the registration."
          confirmLabel="Mark under review"
        />
      )}
      {status !== "NEEDS_CORRECTION" && (
        <ConfirmAction
          action={reviewRegistration}
          hidden={hidden("NEEDS_CORRECTION")}
          trigger="Request correction"
          triggerClass={btn.secondary}
          title="Request a correction?"
          body="The applicant sees “Needs correction” on the status page. Contact them with the details: the reason below stays private."
          reason={{ label: "What needs correcting (required, private)", required: true, placeholder: "e.g. ID card photo is unreadable" }}
          confirmLabel="Request correction"
        />
      )}
      <ConfirmAction
        action={reviewRegistration}
        hidden={hidden("REJECTED")}
        trigger="Reject"
        triggerClass={btn.secondary}
        title={`Reject ${reference}?`}
        body="Every player still waiting in this registration is rejected. No player record is created."
        reason={{ label: "Reason (required, private)", required: true, placeholder: "e.g. Not registered students of EKSU" }}
        confirmLabel="Reject registration"
      />
    </div>
  );
}

export function RejectPersonAction({ id, name, registrationId }: { id: string; name: string; registrationId: string }) {
  return (
    <ConfirmAction
      action={rejectRegistrationPlayer}
      hidden={{ person_id: id, registration_id: registrationId }}
      trigger="Leave out"
      triggerClass={btn.small}
      title={`Leave ${name} out?`}
      body="The rest of the roster can still be accepted. This player gets no player record or screening from this registration."
      reason={{ label: "Reason (required, private)", required: true }}
      confirmLabel="Leave out"
    />
  );
}
