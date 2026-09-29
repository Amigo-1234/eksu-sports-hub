"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isActive, NAV } from "./nav";
import { NavIcon } from "./NavIcon";

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-4">
      {NAV.map((group, i) => (
        <div key={i}>
          {group.heading && <p className="px-3 pb-1 text-[11px] font-extrabold tracking-widest text-ink-faint uppercase">{group.heading}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${
                      active ? "bg-brand-700 text-white" : "text-ink hover:bg-subtle"
                    }`}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Mobile navigation drawer (native <dialog>: focus trap, Escape, inert page). */
export function MobileNav({ footer }: { footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="grid size-11 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface lg:hidden"
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="sr-only">Open menu</span>
      </button>
      <dialog
        ref={ref}
        aria-label="Admin menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-0 h-dvh max-h-dvh w-[min(20rem,85vw)] max-w-none bg-surface p-0 text-ink backdrop:bg-ink/50"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between border-b border-line px-3">
            <span className="font-display text-lg font-extrabold uppercase">Admin menu</span>
            <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-lg hover:bg-subtle">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              <span className="sr-only">Close menu</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">{open && <NavLinks onNavigate={() => setOpen(false)} />}</div>
          <div className="border-t border-line p-3">{footer}</div>
        </div>
      </dialog>
    </>
  );
}
