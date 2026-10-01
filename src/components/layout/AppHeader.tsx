import Link from "next/link";
import { DesktopNav } from "./DesktopNav";
import { EksuLogo } from "./EksuLogo";
import { HeaderAlertsLink } from "@/components/notifications/HeaderAlertsLink";
import { ShirtIcon, TrophyIcon } from "@/components/ui/icons";

/** Compact branded app bar. Primary nav lives here on md+, in BottomNav on phones. */
export function AppHeader({ liveCount }: { liveCount: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      {/* Brand stripe */}
      <div className="h-1 bg-brand-700" aria-hidden="true">
        <div className="h-full w-1/3 bg-accent-500" />
      </div>
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center gap-3 px-3 sm:px-4">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-md py-1"
          aria-label="EKSU Sports Hub — home"
        >
          <EksuLogo height={34} priority />
          <span
            className="border-l border-line pl-2 font-display text-[17px] leading-none font-extrabold tracking-tight text-brand-700 uppercase max-[339px]:hidden md:max-lg:hidden"
            aria-hidden="true"
          >
            Sports
          </span>
        </Link>

        <DesktopNav liveCount={liveCount} />
        <div className="hidden md:block">
          <HeaderAlertsLink />
        </div>

        <div className="ml-auto flex items-center gap-0.5 md:hidden">
          {liveCount > 0 && (
            <Link
              href="/live"
              aria-label={`${liveCount} live ${liveCount === 1 ? "match" : "matches"}`}
              className="flex h-9 items-center gap-1.5 rounded-full bg-live-soft px-3 text-xs font-bold tracking-wide whitespace-nowrap text-live uppercase hover:bg-live/15"
            >
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-live-pulse" />
                <span className="relative size-2 rounded-full bg-live" />
              </span>
              {liveCount}
              {/* Phones keep the count only: room for the Register, Competitions and Alerts icons. */}
              <span className="max-sm:hidden">Live</span>
            </Link>
          )}
          <Link
            href="/register"
            aria-label="Register"
            className="grid size-10 place-items-center rounded-full text-brand-700 hover:bg-brand-50"
          >
            <ShirtIcon size={21} />
          </Link>
          <Link
            href="/competitions"
            aria-label="Competitions"
            className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-subtle hover:text-ink"
          >
            <TrophyIcon size={21} />
          </Link>
          <HeaderAlertsLink />
        </div>
      </div>
    </header>
  );
}
