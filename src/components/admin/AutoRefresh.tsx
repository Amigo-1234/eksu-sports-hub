"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-fetches server data on an interval while the tab is visible. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-xs font-bold">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-brand-700" />
      Auto-refresh every {seconds}s
    </label>
  );
}
