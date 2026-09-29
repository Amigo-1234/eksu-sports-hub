"use client";

import { useActionState, useEffect, useRef, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/lib/admin/types";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Form bound to an admin server action. Disables itself while submitting
 * (no double submits), announces the result, and keeps the user's input on
 * errors (React would otherwise reset uncontrolled fields after an action).
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  onDone,
  hideMessage = false,
  render,
}: {
  action: Action;
  children?: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onDone?: (state: NonNullable<ActionState>) => void;
  hideMessage?: boolean;
  /** Render prop variant with access to the latest result. */
  render?: (s: { state: ActionState; pending: boolean }) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const lastAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state || state.at === lastAt.current) return;
    lastAt.current = state.at;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onDone?.(state);
  }, [state, resetOnSuccess, onDone]);

  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        startTransition(() => formAction(fd));
      }}
    >
      <fieldset disabled={pending} className="contents">
        {render ? render({ state, pending }) : children}
      </fieldset>
      {!hideMessage && <FormMessage state={state} />}
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {state && !state.ok && state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm font-semibold text-loss">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p className="mt-3 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">{state.message}</p>
      )}
    </div>
  );
}

/** Submit button that shows progress while its form is pending. */
export function Submit({ children, pendingLabel = "Saving…", className, name, value }: { children: ReactNode; pendingLabel?: string; className: string; name?: string; value?: string }) {
  return (
    <button type="submit" className={className} name={name} value={value}>
      <span className="[fieldset:disabled_&]:hidden">{children}</span>
      <span className="hidden [fieldset:disabled_&]:inline" aria-hidden="true">
        {pendingLabel}
      </span>
    </button>
  );
}
