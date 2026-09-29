"use client";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="rounded-card border border-loss/40 bg-surface px-5 py-10 text-center">
      <h1 className="font-display text-2xl font-extrabold uppercase">This page could not load</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        {error.message?.startsWith("Could not load") ? error.message : "Something went wrong while loading admin data."} Check your connection and try again.
      </p>
      <button type="button" onClick={retry} className="mt-4 inline-flex h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-bold text-white">
        Try again
      </button>
    </div>
  );
}
