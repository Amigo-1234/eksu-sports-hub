import Image from "next/image";
import Link from "next/link";
import { OperatorRuntime } from "@/components/operator/OperatorRuntime";
import { SignOutButton } from "@/components/operator/SignOutButton";
import { operatorBackendConfig } from "@/lib/operator/backend";
import { requireOperator } from "@/lib/operator/session";
import crest from "../../../../public/brand/eksu-crest-192.png";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOperator();
  if (!session.configured) return null; // the /op layout explains the configuration problem
  const { operator, allowed } = session;
  const cfg = operatorBackendConfig();
  const mock = cfg.ok && cfg.kind === "mock";

  return (
    <OperatorRuntime>
      <header className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-3">
          <Link href="/op" className="flex h-11 min-w-0 items-center gap-2 rounded-md">
            <Image src={crest} alt="" width={28} height={28} className="shrink-0" />
            <span className="truncate font-display text-lg leading-none font-extrabold tracking-tight uppercase">
              <span className="max-[359px]:hidden">Match </span>Operator
            </span>
          </Link>
          {mock && (
            <span className="ml-auto shrink-0 rounded border border-accent-700 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-accent-700 uppercase">
              Demo
            </span>
          )}
          <span className={`${mock ? "" : "ml-auto"} max-w-28 truncate text-xs font-semibold text-ink-muted`} title="Signed in">
            {operator.displayName}
          </span>
          {!mock && <SignOutButton />}
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-3 pb-24">
        {allowed ? (
          children
        ) : (
          <div className="py-12 text-center">
            <h1 className="font-display text-2xl font-extrabold uppercase">No operator access</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              You are signed in, but your account has not been given an operator role. Ask an EKSU Sports administrator.
            </p>
          </div>
        )}
      </div>
    </OperatorRuntime>
  );
}
