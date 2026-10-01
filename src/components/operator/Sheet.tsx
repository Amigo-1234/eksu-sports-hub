"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Accessible bottom sheet built on the native <dialog>: focus is trapped,
 * Escape closes, and the page behind is inert. Centred on larger screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = "Cancel",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Sticky action area (e.g. the confirm button). */
  footer?: ReactNode;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto h-auto max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/55 open:flex sm:top-1/2 sm:bottom-auto sm:max-h-[88dvh] sm:-translate-y-1/2 sm:rounded-2xl [&:not([open])]:hidden"
    >
      {open && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 id={titleId} className="font-display text-xl font-extrabold tracking-tight uppercase">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="h-11 min-w-11 rounded-lg border border-line px-3 text-sm font-bold text-ink-muted hover:bg-subtle"
            >
              {closeLabel}
            </button>
          </div>
          {/* flex: 1 1 auto (not flex-1's 0% basis): WebKit/iPad collapses a 0%-basis
              child of an auto-height column to nothing, clipping the sheet body. */}
          <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
          )}
        </>
      )}
    </dialog>
  );
}
