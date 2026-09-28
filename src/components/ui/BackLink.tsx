"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeftIcon } from "./icons";

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
 * plain link (deep links, shared URLs, new tabs).
 */
export function BackLink({ fallbackHref = "/", label = "Back" }: { fallbackHref?: string; label?: string }) {
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
      className="mb-2 inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1.5 text-sm font-semibold text-ink-muted hover:bg-subtle hover:text-ink"
    >
      <ChevronLeftIcon size={18} />
      {label}
    </Link>
  );
}
