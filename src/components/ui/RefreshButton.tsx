"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshIcon } from "./icons";

/** Re-fetches server data for the current route. Not a realtime connection. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] font-semibold text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-60"
    >
      <RefreshIcon size={15} className={pending ? "motion-safe:animate-spin" : undefined} />
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
