"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/operator/Sheet";
import { PREF_KEYS, PREF_LABEL, type PrefKey } from "@/lib/notifications/prefs";
import { useAlerts } from "./AlertsProvider";

export interface SheetAction {
  label: string;
  run: () => Promise<boolean>;
  tone?: "danger" | "neutral";
  /** Toast shown after it succeeds. */
  done?: string;
}

/**
 * Explain → choose → confirm. Shared by "Notify me" (match) and "Follow
 * team". Permission is only requested when the person taps the primary
 * button, and only if this browser can actually receive push.
 */
export function AlertPrefsSheet({
  open,
  onClose,
  title,
  subtitle,
  note,
  initial,
  options = PREF_KEYS,
  primaryLabel,
  onSave,
  secondary,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: ReactNode;
  note?: ReactNode;
  initial: PrefKey[];
  options?: readonly PrefKey[];
  primaryLabel: string;
  /** Persist the choice; push is already enabled when this runs. */
  onSave: (events: PrefKey[]) => Promise<boolean>;
  secondary?: SheetAction;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} closeLabel="Close">
      {/* Remount per opening so the checkboxes start from the saved settings. */}
      {open && (
        <SheetBody
          subtitle={subtitle}
          note={note}
          initial={initial}
          options={options}
          primaryLabel={primaryLabel}
          onSave={onSave}
          secondary={secondary}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function SheetBody({
  subtitle,
  note,
  initial,
  options,
  primaryLabel,
  onSave,
  secondary,
  onDone,
}: {
  subtitle: ReactNode;
  note?: ReactNode;
  initial: PrefKey[];
  options: readonly PrefKey[];
  primaryLabel: string;
  onSave: (events: PrefKey[]) => Promise<boolean>;
  secondary?: SheetAction;
  onDone: () => void;
}) {
  const alerts = useAlerts();
  const [events, setEvents] = useState<Set<PrefKey>>(() => new Set(initial));
  const [busy, setBusy] = useState<"save" | "secondary" | null>(null);
  const [problem, setProblem] = useState<"denied" | "unsupported" | "dismissed" | null>(() =>
    alerts.support?.kind === "unsupported" ? "unsupported" : alerts.permission === "denied" ? "denied" : null,
  );
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: PrefKey) =>
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function save() {
    setError(null);
    setBusy("save");
    try {
      if (!alerts.pushOn) {
        const r = await alerts.enablePush();
        if (!r.ok) {
          if (r.reason === "ios-install") return onDone();
          if (r.reason === "error") setError(r.message ?? "Something went wrong. Please try again.");
          else setProblem(r.reason);
          return;
        }
      }
      const chosen = options.filter((k) => events.has(k));
      if (await onSave(chosen)) {
        alerts.toast("Notifications on");
        onDone();
      }
    } finally {
      setBusy(null);
    }
  }

  async function runSecondary() {
    if (!secondary) return;
    setBusy("secondary");
    try {
      if (await secondary.run()) {
        if (secondary.done) alerts.toast(secondary.done);
        onDone();
      }
    } finally {
      setBusy(null);
    }
  }

  const chosenCount = options.filter((k) => events.has(k)).length;

  if (problem === "unsupported") {
    return (
      <Notice title="Push notifications aren't supported in this browser yet.">
        Try the latest Chrome, Edge, Firefox or Safari. On iPhone or iPad, add EKSU Sports to your Home Screen first.
        {secondary && <SecondaryButton action={secondary} busy={busy} onClick={runSecondary} />}
      </Notice>
    );
  }
  if (problem === "denied") {
    return (
      <Notice title="Notifications are blocked for this site">
        You chose not to allow notifications, and we won&apos;t ask again. If you change your mind, allow notifications
        for this site in your browser or device settings, then come back here.
        {secondary && <SecondaryButton action={secondary} busy={busy} onClick={runSecondary} />}
      </Notice>
    );
  }

  return (
    <div>
      <p className="text-[15px] leading-snug text-ink-muted">{subtitle}</p>
      {note && <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{note}</p>}
      {problem === "dismissed" && (
        <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-sm text-ink-muted" role="status">
          No problem — nothing was turned on. Tap the button again whenever you&apos;re ready.
        </p>
      )}

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-bold tracking-wide text-ink-faint uppercase">Alert me about</legend>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {options.map((k) => (
            <li key={k}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-subtle/60">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{PREF_LABEL[k].label}</span>
                  {PREF_LABEL[k].hint && <span className="block text-xs text-ink-faint">{PREF_LABEL[k].hint}</span>}
                </span>
                <input
                  type="checkbox"
                  checked={events.has(k)}
                  onChange={() => toggle(k)}
                  className="peer sr-only"
                  data-pref={k}
                />
                <span
                  aria-hidden="true"
                  className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
                />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {!alerts.pushOn && (
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Your browser will ask for permission. No account needed — your choices stay on this device, and you can turn
          them off any time in <Link href="/notifications" className="font-semibold underline">Alerts</Link>.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-live-soft px-3 py-2 text-sm font-semibold text-live" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={save}
          disabled={busy !== null || chosenCount === 0}
          className="h-12 w-full rounded-xl bg-brand-700 text-base font-bold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {busy === "save" ? "Turning on…" : chosenCount === 0 ? "Choose at least one alert" : primaryLabel}
        </button>
        {secondary && <SecondaryButton action={secondary} busy={busy} onClick={runSecondary} />}
      </div>
    </div>
  );
}

function SecondaryButton({ action, busy, onClick }: { action: SheetAction; busy: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`mt-3 h-11 w-full rounded-xl border text-sm font-bold disabled:opacity-50 ${
        action.tone === "danger" ? "border-live/40 text-live hover:bg-live-soft" : "border-line text-ink-muted hover:bg-subtle"
      }`}
    >
      {busy === "secondary" ? "Saving…" : action.label}
    </button>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-line bg-subtle/60 p-4">
      <p className="font-display text-lg leading-tight font-extrabold">{title}</p>
      <div className="mt-2 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}
