import type { Metadata } from "next";
import { connection } from "next/server";
import { operatorBackendConfig } from "@/lib/operator/backend";

export const metadata: Metadata = {
  title: { default: "Match Operator", template: "%s · Operator · EKSU Sports" },
  robots: { index: false, follow: false },
};

/** Refuses to run the operator app on a missing/invalid backend config (no silent fallback). */
export default async function OperatorRootLayout({ children }: LayoutProps<"/op">) {
  await connection();
  const cfg = operatorBackendConfig();
  if (!cfg.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold uppercase">Operator console unavailable</h1>
        <p className="mt-2 text-sm text-ink-muted">{cfg.error}</p>
      </main>
    );
  }
  return <>{children}</>;
}
