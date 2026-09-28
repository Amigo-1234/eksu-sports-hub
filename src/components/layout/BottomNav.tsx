"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "./navigation";

/** Thumb-reachable primary navigation for phones. Hidden from md up. */
export function BottomNav({ liveCount }: { liveCount: number }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.inBottomBar);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-safe backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid h-[var(--bottom-nav-h)] max-w-lg grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          const isLiveTab = href === "/live";
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-wide transition-colors ${
                  active ? "text-brand-700" : "text-ink-faint hover:text-ink"
                }`}
              >
                <span
                  className={`absolute top-0 h-[3px] w-8 rounded-b-full transition-colors ${
                    active ? "bg-brand-700" : "bg-transparent"
                  }`}
                  aria-hidden="true"
                />
                <span className="relative">
                  <Icon size={22} className={isLiveTab && liveCount > 0 && !active ? "text-live" : undefined} />
                  {isLiveTab && liveCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] leading-none font-bold text-white tabular-nums">
                      {liveCount}
                    </span>
                  )}
                </span>
                <span>
                  {label}
                  {isLiveTab && liveCount > 0 && (
                    <span className="sr-only">, {liveCount} matches in progress</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
