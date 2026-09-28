import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { OperatorRuntime } from "@/components/operator/OperatorRuntime";
import { getCurrentOperator } from "@/lib/operator/data";
import crest from "../../../public/brand/eksu-crest-192.png";

export const metadata: Metadata = {
  title: { default: "Match Operator", template: "%s · Operator · EKSU Sports" },
  robots: { index: false, follow: false },
};

export default async function OperatorLayout({ children }: LayoutProps<"/op">) {
  const operator = await getCurrentOperator();
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
          <span className="ml-auto shrink-0 rounded border border-accent-700 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-accent-700 uppercase">
            Demo
          </span>
          <span className="max-w-28 truncate text-xs font-semibold text-ink-muted" title="Signed in (mock)">
            {operator.displayName}
          </span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-3 pb-24">{children}</div>
    </OperatorRuntime>
  );
}
