import Link from "next/link";
import { DesktopNav } from "./DesktopNav";
import { EksuLogo } from "./EksuLogo";
import { HeaderAlertsLink } from "@/components/notifications/HeaderAlertsLink";
import { ShirtIcon, TrophyIcon } from "@/components/ui/icons";

const iconBtn =
  "grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink min-[400px]:size-10";

/**
 * Compact branded app bar. Primary nav lives here from lg up; phones and
 * tablets use the BottomNav and keep the secondary actions as icons.
 */
export function AppHeader({ liveCount }: { liveCount: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-chrome">
      {/* EKSU stripe: burgundy with a gold lead */}
      <div className="flex h-[var(--header-stripe)]" aria-hidden="true">
        <div className="w-1/4 bg-accent-500" />
        <div className="flex-1 bg-brand-700" />
      </div>
      <div className="mx-auto flex h-[var(--header-h)] max-w-7xl items-center gap-2 px-3 sm:px-4 lg:gap-6">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-md sm:gap-2.5"
          aria-label="EKSU Sports Hub — home"
        >
          <EksuLogo plate priority heightClass="h-[31px] min-[360px]:h-[34px] min-[400px]:h-[36px] md:h-[44px]" />
          <span
            className="flex flex-col font-display leading-none font-extrabold tracking-[0.04em] text-white uppercase"
            aria-hidden="true"
          >
            <span className="text-[19px] min-[400px]:text-[21px] md:text-[26px]">Sports</span>
            <span className="mt-[3px] h-[3px] w-full rounded-full bg-brand-600" />
          </span>
        </Link>

        <DesktopNav liveCount={liveCount} />

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {liveCount > 0 && (
            <Link
              href="/live"
              aria-label={`${liveCount} live ${liveCount === 1 ? "match" : "matches"}`}
              className="mr-0.5 flex h-8 items-center gap-1.5 rounded-full border border-live/40 bg-live-soft px-2.5 text-xs font-bold tracking-wide whitespace-nowrap text-live uppercase hover:bg-live/15 lg:hidden"
            >
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-live-pulse" />
                <span className="relative size-2 rounded-full bg-live" />
              </span>
              {liveCount}
              <span className="max-[399px]:hidden">Live</span>
            </Link>
          )}
          <Link href="/register" aria-label="Register" className={`${iconBtn} max-[359px]:hidden lg:hidden`}>
            <ShirtIcon size={20} />
          </Link>
          <Link href="/competitions" aria-label="Competitions" className={`${iconBtn} lg:hidden`}>
            <TrophyIcon size={20} />
          </Link>
          <Link
            href="/register"
            className="hidden h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand-600 hover:bg-brand-50 lg:flex"
          >
            <ShirtIcon size={16} className="text-brand-fg" />
            Register
          </Link>
          <HeaderAlertsLink />
        </div>
      </div>
    </header>
  );
}
