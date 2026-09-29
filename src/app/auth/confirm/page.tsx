import type { Metadata } from "next";
import { connection } from "next/server";
import { ConfirmTokenForm } from "@/components/admin/TokenForms";

export const metadata: Metadata = { title: "Set up your account" };

/** Landing page for one-time invite / password links shared by an admin. */
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  await connection();
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" ? sp.token_hash : "";
  const type = sp.type === "invite" || sp.type === "recovery" ? sp.type : "";
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold uppercase">{type === "recovery" ? "Reset your password" : "Welcome to EKSU Sports"}</h1>
      {tokenHash && type ? (
        <>
          <p className="mt-2 mb-6 text-sm text-ink-muted">
            {type === "recovery" ? "Continue to choose a new password." : "An administrator created a staff account for you. Continue to choose your password."}
          </p>
          <ConfirmTokenForm tokenHash={tokenHash} type={type} />
        </>
      ) : (
        <p role="alert" className="mt-4 text-sm text-loss">This link is incomplete. Ask an administrator for a new one.</p>
      )}
    </>
  );
}
