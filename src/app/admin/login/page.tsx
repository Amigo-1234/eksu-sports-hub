import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SignOut } from "@/components/admin/SignOut";
import { LoginForm } from "@/components/operator/LoginForm";
import { getAdminSession } from "@/lib/admin/permissions";
import crest from "../../../../public/brand/eksu-crest-192.png";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLogin({ searchParams }: PageProps<"/admin/login">) {
  const session = await getAdminSession();
  if (session.kind === "admin") redirect("/admin");
  const next = (await searchParams).next;
  const safeNext = typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") && !next.startsWith("/admin/login") ? next : "/admin";

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Image src={crest} alt="" width={40} height={40} />
        <div>
          <p className="text-xs font-bold tracking-widest text-ink-muted uppercase">EKSU Sports</p>
          <h1 className="font-display text-3xl leading-none font-extrabold uppercase">Admin sign in</h1>
        </div>
      </div>
      {session.kind === "unconfigured" ? (
        <p role="alert" className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
          The admin dashboard is not connected to its database on this deployment. {session.error}
        </p>
      ) : session.kind === "forbidden" || session.kind === "deactivated" ? (
        <div className="space-y-4">
          <p role="alert" className="rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm text-loss">
            You are signed in as <strong>{session.identity.email}</strong>, which does not have administrator access
            {session.kind === "deactivated" ? " (this account is deactivated)" : ""}.
          </p>
          <SignOut />
        </div>
      ) : (
        <LoginForm next={safeNext} />
      )}
      <p className="mt-6 text-xs text-ink-muted">For EKSU Sports administrators only. Accounts are created by an administrator; there is no public sign-up.</p>
    </main>
  );
}
