"use client";

import Link from "next/link";
import { confirmToken, setPassword } from "@/lib/admin/actions/auth";
import { ActionForm, Submit } from "./ActionForm";
import { btn, Field, inputCls } from "./ui";

export function ConfirmTokenForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  return (
    <ActionForm action={confirmToken}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <Submit className={`${btn.primary} w-full`} pendingLabel="Checking link…">
        Continue
      </Submit>
    </ActionForm>
  );
}

export function SetPasswordForm() {
  return (
    <ActionForm
      action={setPassword}
      render={({ state }) =>
        state?.ok ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">Password saved.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin" className={btn.primary}>
                Admin dashboard
              </Link>
              <Link href="/op" className={btn.secondary}>
                Operator console
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="New password" hint="At least 10 characters. Never share it — administrators cannot see it.">
              <input type="password" name="password" required minLength={10} autoComplete="new-password" className={inputCls} />
            </Field>
            <Field label="Repeat password">
              <input type="password" name="confirm" required minLength={10} autoComplete="new-password" className={inputCls} />
            </Field>
            <Submit className={`${btn.primary} w-full`}>Save password</Submit>
          </div>
        )
      }
    />
  );
}
