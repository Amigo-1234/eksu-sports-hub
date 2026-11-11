import Link from "next/link";
import { EksuLogo } from "./EksuLogo";

export function SiteFooter() {
  return (
    <footer className="hidden border-t border-line bg-chrome lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 text-xs text-ink-faint">
        <p className="flex items-center gap-3">
          <EksuLogo plate height={30} />
          <span>
            <span className="font-display text-sm font-extrabold tracking-wide text-ink uppercase">Sports Hub</span>
            <span className="mx-1.5" aria-hidden="true">·</span>Ado-Ekiti
          </span>
        </p>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link href="/competitions" className="hover:text-ink">Competitions</Link>
          <Link href="/register" className="hover:text-ink">Register</Link>
          <span>All times are West Africa Time (WAT).</span>
        </nav>
      </div>
    </footer>
  );
}
