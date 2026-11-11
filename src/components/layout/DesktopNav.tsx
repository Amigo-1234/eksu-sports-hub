"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "./navigation";

/** Header category nav (lg+): text tabs with an underline for the current section. */
export function DesktopNav({ liveCount }: { liveCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden h-full lg:block">
      <ul className="flex h-full items-stretch">
        {NAV_ITEMS.filter((i) => i.href !== "/register").map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          const isLive = href === "/live";
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 px-3 text-[15px] font-semibold whitespace-nowrap transition-colors xl:px-4 ${
                  active ? "text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon
                  size={18}
                  className={`hidden xl:block ${isLive && liveCount > 0 ? "text-live" : active ? "text-brand-fg" : ""}`}
                />
                {isLive && liveCount > 0 && (
                  <span className="relative flex size-2 xl:hidden" aria-hidden="true">
                    <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-live-pulse" />
                    <span className="relative size-2 rounded-full bg-live" />
                  </span>
                )}
                {label}
                {isLive && liveCount > 0 && (
                  <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-live px-1 text-[11px] leading-none font-bold text-canvas tabular-nums">
                    {liveCount}
                    <span className="sr-only"> matches in progress</span>
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-colors ${active ? "bg-brand-600" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
