"use client";

import { operatorControl } from "@/lib/operator/actions";
import { useConnection } from "@/lib/operator/hooks";
import { useFeedback } from "./Feedback";
import { HoldButton } from "./HoldButton";

/** Shown when another assigned operator controls the match. */
export function TakeOverBanner({
  matchId,
  title = "Another operator is in control",
  body = "You can watch this match. Take over only if the operator in control can no longer continue — the change is recorded in the audit log.",
  onTaken,
}: {
  matchId: string;
  title?: string;
  body?: string;
  onTaken?: () => void;
}) {
  const notify = useFeedback();
  const { online } = useConnection();
  return (
    <section role="status" className="mt-3 rounded-2xl border-[3px] border-ink bg-accent-100 p-4">
      <p className="font-display text-xl font-extrabold uppercase">{title}</p>
      <p className="mt-1 text-sm font-semibold text-ink-muted">{body}</p>
      <div className="mt-3">
        <HoldButton
          tone="brand"
          label="Hold to take over"
          disabled={!online}
          hint={online ? "Press and hold to take control" : "Taking over needs a connection"}
          onConfirm={async () => {
            const r = await operatorControl.takeOver(matchId);
            notify(r.ok ? { tone: "success", message: "You are now in control" } : { tone: "error", message: r.reason });
            if (r.ok) onTaken?.();
          }}
        />
      </div>
    </section>
  );
}
