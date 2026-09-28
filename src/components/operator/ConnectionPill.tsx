"use client";

import { useConnection } from "@/lib/operator/hooks";

/** Header connection/sync state. Always text + shape, never colour alone. */
export function ConnectionPill() {
  const { status, snap } = useConnection();
  if (!snap.hydrated) {
    return <span className="h-8 w-24 animate-pulse rounded-full bg-subtle" aria-hidden="true" />;
  }
  const map = {
    CONNECTED: { text: "Connected", cls: "bg-win/12 text-win border-win/30", icon: "●" },
    SYNCING: { text: "Syncing", cls: "bg-accent-100 text-accent-700 border-accent-300", icon: "↻" },
    OFFLINE: { text: "Offline", cls: "bg-ink text-white border-ink", icon: "⨯" },
    NEEDS_ATTENTION: { text: "Attention", cls: "bg-live text-white border-live", icon: "!" },
  } as const;
  const m = map[status.kind];
  const extra =
    status.kind === "OFFLINE" ? ` · ${status.queued} queued` :
    status.kind === "SYNCING" ? ` · ${status.count}` :
    status.kind === "NEEDS_ATTENTION" ? ` · ${status.failed} failed` : "";
  const full = status.kind === "NEEDS_ATTENTION" ? `Needs attention${extra}` : `${m.text}${extra}`;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold tracking-wide whitespace-nowrap uppercase ${m.cls}`}
    >
      <span aria-hidden="true">{m.icon}</span>
      <span aria-hidden="true">
        {m.text}
        {extra}
      </span>
      <span className="sr-only">Connection: {full}</span>
    </span>
  );
}
