import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LoginForm } from "@/components/operator/LoginForm";
import { operatorBackendConfig } from "@/lib/operator/backend";
import { operatorDataSource } from "@/lib/operator/data";
import crest from "../../../../public/brand/eksu-crest-192.png";

export const metadata: Metadata = { title: "Sign in" };

export default async function OperatorLogin({ searchParams }: PageProps<"/op/login">) {
  await connection();
  const cfg = operatorBackendConfig();
  if (!cfg.ok) return null; // the /op layout explains the configuration problem
  if (cfg.kind === "mock") redirect("/op"); // demo has no sign-in
  if (await operatorDataSource().getCurrentOperator()) redirect("/op");
  const next = (await searchParams).next;
  const safeNext = typeof next === "string" && next.startsWith("/op") && !next.startsWith("//") ? next : "/op";
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Image src={crest} alt="" width={40} height={40} />
        <div>
          <p className="text-xs font-bold tracking-widest text-ink-muted uppercase">EKSU Sports</p>
          <h1 className="font-display text-3xl leading-none font-extrabold uppercase">Operator sign in</h1>
        </div>
      </div>
      <LoginForm next={safeNext} />
      <p className="mt-6 text-xs text-ink-muted">
        For authorised EKSU sports staff only. Access is limited to matches you are assigned to.
      </p>
    </main>
  );
}
