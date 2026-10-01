"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "./navigation";

export function DesktopNav({ liveCount }: { liveCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="ml-auto hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold whitespace-nowrap transition-colors lg:px-3.5 ${
                  active ? "bg-brand-700 text-white" : "text-ink-muted hover:bg-subtle hover:text-ink"
                }`}
              >
                {href === "/live" && liveCount > 0 && (
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className={`absolute inset-0 rounded-full motion-safe:animate-live-pulse ${active ? "bg-white" : "bg-live"}`} />
                    <span className={`relative size-2 rounded-full ${active ? "bg-white" : "bg-live"}`} />
                  </span>
                )}
                {label}
                {href === "/live" && liveCount > 0 && (
                  <span className="text-xs tabular-nums opacity-80">
                    {liveCount}
                    <span className="sr-only"> matches in progress</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
