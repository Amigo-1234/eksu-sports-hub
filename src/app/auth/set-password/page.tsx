import type { Metadata } from "next";
import { connection } from "next/server";
import { SetPasswordForm } from "@/components/admin/TokenForms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  await connection();
  const user = supabaseEnv().ok ? (await (await createSupabaseServerClient()).auth.getUser()).data.user : null;
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold uppercase">Choose a password</h1>
      {user ? (
        <>
          <p className="mt-2 mb-6 text-sm text-ink-muted">
            Signed in as <strong>{user.email}</strong>.
          </p>
          <SetPasswordForm />
        </>
      ) : (
        <p role="alert" className="mt-4 text-sm text-loss">
          Your link session has expired. Ask an administrator for a new invite or password link.
        </p>
      )}
    </>
  );
}
