"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface LinkTab {
  href: string;
  label: string;
}

/**
 * Route-based tabs (each tab is its own URL). Rendered as a nav of links with
 * aria-current, which is the correct pattern for page-level tabs.
 */
export function LinkTabs({ label, tabs }: { label: string; tabs: LinkTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-3 border-b border-line sm:mx-0">
      <ul className="scrollbar-none flex overflow-x-auto px-3 sm:px-0">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 items-center px-3.5 text-sm font-semibold transition-colors ${
                  active ? "text-brand-700" : "text-ink-faint hover:text-ink"
                }`}
              >
                {t.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2 -bottom-px h-[3px] rounded-t ${active ? "bg-brand-700" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
