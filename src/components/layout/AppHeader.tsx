import Link from "next/link";
import { EksuMark } from "./EksuMark";
import { DesktopNav } from "./DesktopNav";
import { TrophyIcon } from "@/components/ui/icons";

/** Compact branded app bar. Primary nav lives here on md+, in BottomNav on phones. */
export function AppHeader({ liveCount }: { liveCount: number }) {
  return (
    <header className="sticky top-0 z-40 bg-brand-800 text-white shadow-[0_1px_0_rgb(0_0_0/0.15)]">
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center gap-3 px-3 sm:px-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-1"
          aria-label="EKSU Sports Hub — home"
        >
          <EksuMark size={30} />
          <span className="flex flex-col leading-none whitespace-nowrap">
            <span className="font-display text-[19px] font-extrabold tracking-tight uppercase">
              EKSU <span className="text-accent-400">Sports</span>
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-[0.14em] text-white/65 uppercase max-[359px]:hidden">
              Ekiti State University
            </span>
          </span>
        </Link>

        <DesktopNav liveCount={liveCount} />

        <div className="ml-auto flex items-center gap-1.5 md:hidden">
          {liveCount > 0 && (
            <Link
              href="/live"
              className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 px-3 text-xs font-bold tracking-wide uppercase hover:bg-white/15"
            >
              <span className="relative flex size-2">
                <span className="absolute inset-0 rounded-full bg-accent-400 motion-safe:animate-live-pulse" />
                <span className="relative size-2 rounded-full bg-accent-400" />
              </span>
              {liveCount} Live
            </Link>
          )}
          <Link
            href="/competitions"
            aria-label="Competitions"
            className="grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10 hover:text-white"
          >
            <TrophyIcon size={21} />
          </Link>
        </div>
      </div>
    </header>
  );
}
