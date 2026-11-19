"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "@/components/ui/icons";

/** Search field that updates ?q= as you type (debounced), keeping results server-rendered. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial);
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const v = q.trim();
      start(() => router.replace(v ? `${pathname}?q=${encodeURIComponent(v)}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [q, pathname, router]);

  return (
    <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
      <SearchIcon size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value.slice(0, 60))}
        autoFocus
        enterKeyHint="search"
        placeholder="Teams, players, leagues…"
        aria-label="Search teams, players and leagues"
        className="h-12 w-full rounded-2xl border border-line bg-surface pr-10 pl-11 text-[16px] shadow-card outline-none ring-brand-500/30 focus:border-brand-500 focus:ring-2"
      />
      {pending && <span className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand-600" aria-label="Searching" />}
    </form>
  );
}
