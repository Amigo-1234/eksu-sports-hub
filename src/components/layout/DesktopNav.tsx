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
                className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                  active ? "bg-white text-brand-800" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                {href === "/live" && liveCount > 0 && (
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-live-pulse" />
                    <span className={`relative size-2 rounded-full ${active ? "bg-live" : "bg-accent-400"}`} />
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
