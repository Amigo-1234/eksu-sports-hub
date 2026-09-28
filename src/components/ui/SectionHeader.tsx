import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

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
    <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
      <h2 id={id} className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
        {title}
        {adornment}
      </h2>
      {href && (
        <Link
          href={href}
          className="-mr-1 flex h-9 items-center gap-0.5 rounded-full px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {linkLabel}
          <ChevronRightIcon size={16} />
          <span className="sr-only">: {title}</span>
        </Link>
      )}
    </div>
  );
}
