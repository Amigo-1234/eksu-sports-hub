"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BackArrowIcon } from "./icons";

/* Counts in-app route changes so "Back" only uses history when it stays in the app. */
let inAppNavigations = 0;

/** Mounted once in the root layout. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    inAppNavigations++;
  }, [pathname]);
  return null;
}

/**
 * Returns to the previous in-app screen when there is one; otherwise it is a
 * plain link to `fallbackHref` (deep links from WhatsApp, shared URLs, new tabs).
 * 44px touch target; the label is visible and is also the accessible name.
 */
export function BackLink({ fallbackHref = "/", label = "Back", className = "" }: { fallbackHref?: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      onClick={(e) => {
        if (inAppNavigations > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className={`group mb-2 -ml-1 inline-flex h-11 items-center gap-2 rounded-full pr-3 pl-1 text-sm font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600 ${className}`}
    >
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-full border border-line bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-colors group-hover:border-line-strong group-hover:bg-subtle"
      >
        <BackArrowIcon size={18} />
      </span>
      {label}
    </Link>
  );
}
