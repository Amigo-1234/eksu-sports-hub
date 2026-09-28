"use client";

export default function OperatorError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="py-12 text-center">
      <h1 className="font-display text-2xl font-extrabold uppercase">Couldn&apos;t load</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        Something went wrong loading your assignments. Actions already recorded on this device are kept.
      </p>
      <button type="button" onClick={() => retry()} className="mt-5 h-12 rounded-xl bg-brand-700 px-6 font-bold text-white">
        Try again
      </button>
    </div>
  );
}
