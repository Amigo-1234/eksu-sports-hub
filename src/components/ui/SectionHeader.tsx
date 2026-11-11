import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

/** Compact section title bar: uppercase label, optional adornment, "see all" link. */
export function SectionHeader({
  id,
  title,
  href,
  linkLabel = "See all",
  adornment,
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
  /** Rendered after the title, e.g. a live dot or count. */
  adornment?: ReactNode;
}) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1">
      <h2 id={id} className="flex items-center gap-2 font-display text-[19px] leading-none font-bold tracking-[0.02em] uppercase">
        {title}
        {adornment}
      </h2>
      {href && (
        <Link
          href={href}
          className="-mr-1.5 flex h-8 items-center gap-0.5 rounded-full px-2 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
        >
          {linkLabel}
          <ChevronRightIcon size={15} />
          <span className="sr-only">: {title}</span>
        </Link>
      )}
    </div>
  );
}
