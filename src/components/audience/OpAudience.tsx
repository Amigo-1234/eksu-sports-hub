"use client";

import { useEffect, useState } from "react";
import { EyeIcon } from "@/components/ui/icons";
import type { AudienceSummary } from "@/lib/audience/types";
import { backendKind } from "@/lib/operator/hooks";
import { supabaseBrowser } from "@/lib/supabase/browser";

const POLL_MS = 15_000;

/**
 * Glanceable private audience line for the assigned operator(s). Reads
 * op_match_audience (active assignment required, like the console itself);
 * hides itself on any error. Never shown to the public.
 */
export function OpAudience({ matchId }: { matchId: string }) {
  const [a, setA] = useState<AudienceSummary | null>(null);
  const enabled = backendKind() === "supabase";

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data, error } = await supabaseBrowser().rpc("op_match_audience", { p_match_id: matchId });
        if (alive) setA(error ? null : (data as AudienceSummary));
      } catch {
        if (alive) setA(null);
      }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled, matchId]);

  if (!a) return null;
  return (
    <p
      className="mt-1.5 flex items-center justify-end gap-1.5 text-xs font-semibold text-ink-muted tabular-nums"
      data-testid="op-audience"
      aria-label={`Viewers: ${a.watching_now} watching now, peak ${a.peak_viewers}`}
    >
      <span className="text-[10px] font-bold tracking-wider text-ink-faint uppercase" aria-hidden="true">Viewers</span>
      <EyeIcon size={14} className="text-ink-faint" />
      <span aria-hidden="true">
        <span className="font-bold text-ink" data-testid="op-audience-now">{a.watching_now}</span> live
        <span className="mx-1 text-ink-faint">·</span>
        Peak <span data-testid="op-audience-peak">{a.peak_viewers}</span>
      </span>
    </p>
  );
}
