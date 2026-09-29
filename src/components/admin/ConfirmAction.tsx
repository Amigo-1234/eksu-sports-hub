"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/admin/types";
import { ActionForm, Submit } from "./ActionForm";
import { btn, inputCls } from "./ui";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * A button that opens an accessible confirmation dialog (native <dialog>:
 * focus trapped, Escape closes). Optionally requires a reason and/or typing
 * a word, for destructive or hard-to-reverse operations.
 */
export function ConfirmAction({
  action,
  hidden,
  trigger,
  triggerClass = btn.secondary,
  title,
  body,
  confirmLabel,
  tone = "danger",
  reason,
  typeToConfirm,
  children,
}: {
  action: Action;
  hidden: Record<string, string>;
  trigger: ReactNode;
  triggerClass?: string;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  reason?: { label: string; required?: boolean; placeholder?: string };
  typeToConfirm?: string;
  /** Extra fields rendered inside the dialog form. */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const onDone = useCallback((s: NonNullable<ActionState>) => {
    if (!s.ok) return;
    setOpen(false);
    setNotice(s.message ?? "Done.");
  }, []);

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      >
        {trigger}
      </button>
      <span role="status" className="empty:hidden">
        {notice && <span className="inline-flex min-h-9 items-center rounded-md bg-win/10 px-2 text-xs font-semibold text-win">{notice}</span>}
      </span>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50"
      >
        {open && (
          <ActionForm action={action} onDone={onDone} className="p-5">
            <h2 id={titleId} className="font-display text-xl font-extrabold uppercase">
              {title}
            </h2>
            {body && <div className="mt-2 text-sm text-ink-muted">{body}</div>}
            {Object.entries(hidden).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <div className="mt-4 space-y-3">
              {children}
              {reason && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">{reason.label}</span>
                  <textarea name="reason" required={reason.required} rows={3} maxLength={300} placeholder={reason.placeholder} className={`${inputCls} h-auto py-2`} />
                </label>
              )}
              {typeToConfirm && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">
                    Type <span className="font-mono">{typeToConfirm}</span> to confirm
                  </span>
                  <input name="confirm" required autoComplete="off" className={`${inputCls} font-mono uppercase`} />
                </label>
              )}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <Submit className={tone === "danger" ? btn.danger : btn.primary} pendingLabel="Working…">
                {confirmLabel}
              </Submit>
            </div>
          </ActionForm>
        )}
      </dialog>
    </>
  );
}
