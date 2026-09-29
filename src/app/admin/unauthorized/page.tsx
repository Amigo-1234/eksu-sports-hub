import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOut } from "@/components/admin/SignOut";
import { getAdminSession } from "@/lib/admin/permissions";

export const metadata: Metadata = { title: "No access" };

export default async function Unauthorized() {
  const session = await getAdminSession();
  if (session.kind === "admin") redirect("/admin");
  if (session.kind === "anonymous") redirect("/admin/login");
  const identity = session.kind === "forbidden" || session.kind === "deactivated" ? session.identity : null;
  const isOperator = identity?.roles.some((r) => r === "OPERATOR" || r === "MANAGER");
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
      <p className="text-xs font-bold tracking-widest text-ink-muted uppercase">Error 403</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold uppercase">Administrator access required</h1>
      <p className="mt-3 text-sm text-ink-muted">
        {session.kind === "deactivated"
          ? "Your staff account has been deactivated. Contact an EKSU Sports administrator."
          : session.kind === "unconfigured"
            ? "The admin dashboard is not configured on this deployment."
            : `You are signed in as ${identity?.email ?? "a user"} without the ADMIN role.`}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {isOperator && session.kind !== "deactivated" && (
          <Link href="/op" className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-bold text-white">
            Go to operator console
          </Link>
        )}
        <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-bold">
          Public site
        </Link>
        {identity && <SignOut className="inline-flex h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-bold" />}
      </div>
    </main>
  );
}
