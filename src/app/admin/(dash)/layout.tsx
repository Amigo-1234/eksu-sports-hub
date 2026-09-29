import Image from "next/image";
import Link from "next/link";
import { MobileNav, NavLinks } from "@/components/admin/AdminNav";
import { SignOut } from "@/components/admin/SignOut";
import { requireAdmin } from "@/lib/admin/permissions";
import crest from "../../../../public/brand/eksu-crest-192.png";

/**
 * Admin shell. requireAdmin() runs here AND in every page/data loader (layouts
 * are not re-rendered on client navigation, so they cannot be the only gate).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const who = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{admin.displayName}</p>
        <p className="truncate text-xs text-ink-muted">{admin.email}</p>
      </div>
      <SignOut />
    </div>
  );
  return (
    <div className="flex min-h-dvh flex-1">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <Link href="/admin" className="flex h-16 items-center gap-2.5 border-b border-line px-4">
          <Image src={crest} alt="" width={32} height={32} />
          <span className="leading-none">
            <span className="block text-[11px] font-bold tracking-widest text-ink-muted uppercase">EKSU Sports</span>
            <span className="font-display text-xl font-extrabold uppercase">Admin</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
        <div className="border-t border-line p-3">{who}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4 lg:h-16 lg:px-6">
          <MobileNav footer={who} />
          <Link href="/admin" className="flex min-w-0 items-center gap-2 lg:hidden">
            <Image src={crest} alt="" width={28} height={28} className="shrink-0" />
            <span className="truncate font-display text-lg font-extrabold uppercase">Admin</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="hidden h-9 items-center rounded-md px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:inline-flex">
              Public site ↗
            </Link>
            <span className="hidden max-w-48 truncate text-sm text-ink-muted lg:inline" title={admin.email}>
              {admin.displayName}
            </span>
          </div>
        </header>
        <main id="admin-main" className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
