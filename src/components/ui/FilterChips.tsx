import Link from "next/link";

export interface ChipOption {
  label: string;
  href: string;
  active: boolean;
}

/**
 * Horizontally scrollable filter chips. Links (not buttons) so filters are
 * shareable URLs and work without JavaScript.
 */
export function FilterChips({ label, options }: { label: string; options: ChipOption[] }) {
  return (
    <nav aria-label={label} className="-mx-3 sm:mx-0">
      <ul className="scrollbar-none flex gap-1.5 overflow-x-auto px-3 py-1 sm:flex-wrap sm:px-0">
        {options.map((o) => (
          <li key={o.href} className="shrink-0">
            <Link
              href={o.href}
              scroll={false}
              aria-current={o.active ? "true" : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                o.active
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-line-strong bg-transparent text-ink-muted hover:border-ink-faint hover:text-ink"
              }`}
            >
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
