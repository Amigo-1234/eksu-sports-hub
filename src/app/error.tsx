"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertIcon, RefreshIcon } from "@/components/ui/icons";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-live-soft text-live">
        <AlertIcon size={26} />
      </div>
      <h1 className="font-display text-2xl font-extrabold">Couldn&apos;t load scores</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        Something went wrong fetching the latest match data. Check your connection and try again.
      </p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          <RefreshIcon size={16} /> Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold hover:border-line-strong"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
