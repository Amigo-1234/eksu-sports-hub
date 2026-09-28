"use client";

import { useState } from "react";
import { operatorStore, type NetworkSim } from "@/lib/operator/store";
import { backendKind, useOperatorSnapshot } from "@/lib/operator/hooks";

const OPTIONS: { value: NetworkSim; label: string; help: string }[] = [
  { value: "online", label: "Online", help: "Intents confirm after a short delay" },
  { value: "offline", label: "Offline", help: "Intents wait in the queue" },
  { value: "failing", label: "Server failing", help: "Next intent fails; needs attention" },
];

/** Development-only controls to simulate network conditions and reset state. */
export function DemoControls({ matchId }: { matchId?: string }) {
  const snap = useOperatorSnapshot();
  const [armed, setArmed] = useState(false);
  const live = backendKind() === "supabase";
  if (live && process.env.NODE_ENV === "production") return null;
  const options = live ? OPTIONS.filter((o) => o.value !== "failing") : OPTIONS;
  return (
    <details className="mt-8 rounded-xl border-2 border-dashed border-accent-700 bg-accent-100/50 p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-extrabold tracking-wide text-accent-700 uppercase">
        {live ? "Developer controls" : "Demo controls (development only)"}
      </summary>
      <fieldset className="mt-2">
        <legend className="mb-2 text-sm font-bold">Simulated network</legend>
        <div className="grid gap-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={snap.networkSim === o.value}
              onClick={() => operatorStore.setNetworkSim(o.value)}
              className={`min-h-12 rounded-lg border-2 px-3 py-1.5 text-left ${
                snap.networkSim === o.value ? "border-ink bg-ink text-white" : "border-line-strong bg-surface"
              }`}
            >
              <span className="block text-sm font-bold">{o.label}</span>
              <span className="block text-xs opacity-80">{o.help}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-xs text-ink-muted">
        {live
          ? "Offline simulates losing signal: actions queue on this device and send (idempotently) when you go back online."
          : "Match state and the intent queue are stored in this browser only (localStorage) so a refresh keeps the demo. Nothing is sent to a server."}
      </p>
      {matchId && (
        <button
          type="button"
          onClick={() => {
            if (armed) {
              operatorStore.reset(matchId);
              setArmed(false);
            } else setArmed(true);
          }}
          className={`mt-3 h-12 w-full rounded-lg border-2 text-sm font-bold ${armed ? "border-live bg-live text-white" : "border-line-strong bg-surface"}`}
        >
          {armed ? "Tap again to confirm" : live ? "Clear this device's cache for this match" : "Reset this match to demo data"}
        </button>
      )}
    </details>
  );
}
