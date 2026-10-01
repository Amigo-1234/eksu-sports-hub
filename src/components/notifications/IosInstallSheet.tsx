"use client";

import { Sheet } from "@/components/operator/Sheet";
import { BellIcon, PlusSquareIcon, ShareIcon } from "@/components/ui/icons";

/**
 * iPhone/iPad: Web Push only works for sites added to the Home Screen
 * (iOS/iPadOS 16.4+). Never asks for permission — it explains how to get there.
 */
export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps: { text: React.ReactNode; icon?: React.ReactNode }[] = [
    { text: <>Open EKSU Sports Hub in <strong>Safari</strong>.</> },
    { text: <>Tap the <strong>Share</strong> button.</>, icon: <ShareIcon size={18} /> },
    { text: <>Choose <strong>Add to Home Screen</strong>.</>, icon: <PlusSquareIcon size={18} /> },
    { text: <>Tap <strong>Add</strong>.</> },
    { text: <>Open EKSU Sports from the new icon on your Home Screen.</> },
    { text: <>Come back to this match or team and tap <strong>Enable notifications</strong>.</>, icon: <BellIcon size={18} /> },
  ];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Get live match alerts"
      closeLabel="Close"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl bg-brand-700 text-base font-bold text-white hover:bg-brand-800"
        >
          Got it
        </button>
      }
    >
      <p className="text-[15px] leading-relaxed text-ink-muted">
        On iPhone and iPad, notifications work once EKSU Sports is on your Home Screen. It takes a few seconds — no
        App Store, no account.
      </p>
      <ol className="mt-4 space-y-2.5" data-testid="ios-steps">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-subtle/60 px-3 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-700 font-display text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-[15px] leading-snug">{s.text}</span>
            {s.icon && <span className="shrink-0 text-brand-700">{s.icon}</span>}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-ink-faint">Requires iOS or iPadOS 16.4 or later.</p>
    </Sheet>
  );
}
