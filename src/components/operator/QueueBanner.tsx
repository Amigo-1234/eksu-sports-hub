"use client";

import { useConnection } from "@/lib/operator/hooks";
import { retryFailed } from "@/lib/operator/transport";

/** Explains offline / failed sync and offers the one useful action. */
export function QueueBanner() {
  const { status, snap } = useConnection();
  if (status.kind === "OFFLINE") {
    return (
      <p role="status" className="mt-3 rounded-xl border-2 border-ink bg-ink px-3 py-2.5 text-sm font-bold text-white">
        Offline — keep recording. {status.queued > 0 ? `${status.queued} action${status.queued === 1 ? "" : "s"} saved on this device` : "Actions are saved on this device"} and
        will send when the connection returns.
      </p>
    );
  }
  if (status.kind === "NEEDS_ATTENTION") {
    const failed = snap.intents.find((i) => i.state === "FAILED");
    return (
      <div role="alert" className="mt-3 rounded-xl border-2 border-live bg-live-soft px-3 py-2.5">
        <p className="text-sm font-extrabold text-live">
          ⚠ {status.failed} action{status.failed === 1 ? "" : "s"} failed to sync. Later actions are waiting.
        </p>
        {failed?.lastError && <p className="text-xs font-semibold text-ink-muted">{failed.lastError}</p>}
        <button type="button" onClick={retryFailed} className="mt-2 h-12 w-full rounded-lg bg-live font-extrabold text-white uppercase">
          Retry now
        </button>
      </div>
    );
  }
  return null;
}
