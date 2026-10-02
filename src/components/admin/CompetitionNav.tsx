"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/setup", label: "Setup" },
  { href: "/groups", label: "Groups" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/knockout", label: "Knockout" },
  { href: "/discipline", label: "Discipline" },
] as const;

/** Competition control-centre sections. Scrolls horizontally on phones instead of wrapping. */
export function CompetitionNav({ id }: { id: string }) {
  const path = usePathname();
  const base = `/admin/competitions/${id}`;
  return (
    <nav aria-label="Competition sections" className="-mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const href = base + t.href;
          const active = t.href === "" ? path === base : path.startsWith(href);
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-11 items-center border-b-2 px-3 text-sm font-bold whitespace-nowrap ${
                  active ? "border-brand-700 text-brand-800" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
