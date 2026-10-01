"use client";

import { useActionState } from "react";
import { lookupStatus } from "@/app/(public)/register/actions";
import { STATUS_LABEL, type RegistrationStatus } from "@/lib/registration/rules";
import { inputCls } from "./PersonFields";

const EXPLAIN: Partial<Record<RegistrationStatus, string>> = {
  SUBMITTED: "Received. The Sports Directorate has not reviewed it yet.",
  UNDER_REVIEW: "The Sports Directorate is reviewing this registration.",
  NEEDS_CORRECTION: "Something needs to be corrected. The Sports Directorate will contact you, or contact them directly.",
  ACCEPTED_FOR_SCREENING: "Registration accepted. Eligibility screening is still in progress.",
  REJECTED: "This registration was not accepted. Contact the Sports Directorate for more information.",
  WITHDRAWN: "This registration was withdrawn.",
};
const TONE: Partial<Record<RegistrationStatus, string>> = {
  ACCEPTED_FOR_SCREENING: "border-win/40 bg-win/10 text-win",
  NEEDS_CORRECTION: "border-warn/40 bg-warn-soft text-warn",
  REJECTED: "border-loss/40 bg-live-soft text-loss",
};

/** Safe status lookup: reference + phone → status only (no personal data beyond your own name). */
export function StatusLookup() {
  const [state, action, pending] = useActionState(lookupStatus, null);
  const r = state?.result;
  const status = r?.status as RegistrationStatus | undefined;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <form action={action} className="space-y-4 rounded-card border border-line bg-surface p-4">
        <div>
          <label htmlFor="ref" className="mb-1 block text-sm font-bold">
            Reference
          </label>
          <input
            id="ref"
            name="reference"
            required
            defaultValue={state?.reference ?? ""}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            placeholder="EKSU-FC26-7K4P2D"
            className={`${inputCls()} font-mono uppercase`}
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-bold">
            Phone number used on the registration
          </label>
          <input id="phone" name="phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="08031234567" className={inputCls()} />
        </div>
        <button disabled={pending} className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60 sm:w-auto">
          {pending ? "Checking…" : "Check status"}
        </button>
        <div aria-live="polite" className="empty:hidden">
          {state?.error && (
            <p role="alert" className="rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm font-semibold text-loss">
              {state.error}
            </p>
          )}
        </div>
      </form>

      {r && status && (
        <section aria-labelledby="status-title" className="rounded-card border border-line bg-surface p-4">
          <p className="font-mono text-sm font-bold">{r.reference}</p>
          <h2 id="status-title" className={`mt-2 inline-flex rounded-md border px-2.5 py-1 text-sm font-bold ${TONE[status] ?? "border-line-strong bg-subtle"}`}>
            {STATUS_LABEL[status] ?? status}
          </h2>
          <p className="mt-2 text-sm">{EXPLAIN[status]}</p>
          <dl className="mt-3 divide-y divide-line text-sm">
            {(
              [
                ["Name", r.name],
                ["Competition", `${r.competition} · ${r.season}`],
                ["Team", r.team ?? "—"],
                ["Type", r.type === "TEAM_ROSTER" ? `Team roster · ${r.players} player${r.players === 1 ? "" : "s"}` : "Individual player"],
                ["Submitted", new Date(r.submitted_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1.5">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-semibold break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {status !== "ACCEPTED_FOR_SCREENING" && status !== "REJECTED" && (
            <p className="mt-3 text-xs text-ink-muted">Registering does not make anyone eligible: every player must be screened and cleared by the Sports Directorate.</p>
          )}
        </section>
      )}
    </div>
  );
}
