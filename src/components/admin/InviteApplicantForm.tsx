"use client";

import { ActionForm, FormMessage, Submit } from "./ActionForm";
import { OneTimeLink } from "./LinkForms";
import { btn, Field, inputCls } from "./ui";
import { inviteApplicant } from "@/lib/admin/actions/applications";

/** Explicit activation of an approved applicant (OPERATOR role via the staff invite flow). */
export function InviteApplicantForm({ id, name, email }: { id: string; name: string; email: string }) {
  return (
    <ActionForm
      action={inviteApplicant}
      hideMessage
      render={({ state }) => (
        <>
          <input type="hidden" name="id" value={id} />
          <div className="space-y-3">
            <p className="text-sm break-all">
              Account email: <span className="font-bold">{email}</span>
            </p>
            <Field label="Display name" hint="Shown to other staff, e.g. in match logs.">
              <input name="display_name" required maxLength={80} defaultValue={name} className={inputCls} />
            </Field>
            <Field label="Type INVITE to confirm">
              <input name="confirm" required autoComplete="off" className={inputCls} />
            </Field>
            <Submit className={`${btn.primary} w-full`} pendingLabel="Creating…">
              Create operator account &amp; invite link
            </Submit>
          </div>
          <FormMessage state={state} />
          {state?.ok && state.data?.link ? <OneTimeLink key={state.at} link={state.data.link} /> : null}
        </>
      )}
    />
  );
}
