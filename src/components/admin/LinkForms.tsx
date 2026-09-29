"use client";

import { useState } from "react";
import { createResetLink, inviteStaff } from "@/lib/admin/actions/staff";
import type { ActionState } from "@/lib/admin/types";
import { ActionForm, FormMessage, Submit } from "./ActionForm";
import { btn, Field, inputCls, selectCls } from "./ui";

function OneTimeLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">
      <p className="font-bold text-warn">One-time link — share it privately with this person only.</p>
      <p className="mt-1 text-xs text-ink-muted">It signs them in once so they can choose their own password. It expires (default 24 h) and is not stored or shown again.</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={link} aria-label="One-time link" className={`${inputCls} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className={btn.secondary}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function withLink(state: ActionState) {
  return state?.ok && state.data?.link ? <OneTimeLink key={state.at} link={state.data.link} /> : null;
}

export function InviteForm() {
  return (
    <ActionForm
      action={inviteStaff}
      resetOnSuccess
      hideMessage
      render={({ state }) => (
        <>
          <div className="space-y-3">
            <Field label="Email">
              <input type="email" name="email" required autoComplete="off" className={inputCls} />
            </Field>
            <Field label="Display name" hint="Shown to other staff, e.g. in match logs.">
              <input name="display_name" required maxLength={80} className={inputCls} />
            </Field>
            <Field label="Role">
              <select name="role" defaultValue="OPERATOR" className={selectCls}>
                <option value="OPERATOR">Operator — records assigned matches</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin — full access to this dashboard</option>
              </select>
            </Field>
            <Submit className={`${btn.primary} w-full`} pendingLabel="Creating…">
              Create account & invite link
            </Submit>
          </div>
          <FormMessage state={state} />
          {withLink(state)}
        </>
      )}
    />
  );
}

export function ResetLinkForm({ email }: { email: string }) {
  return (
    <ActionForm
      action={createResetLink}
      hideMessage
      render={({ state }) => (
        <>
          <input type="hidden" name="email" value={email} />
          <Submit className={btn.secondary} pendingLabel="Creating…">
            Create password-reset link
          </Submit>
          <FormMessage state={state} />
          {withLink(state)}
        </>
      )}
    />
  );
}
