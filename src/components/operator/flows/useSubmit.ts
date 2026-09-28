"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/lib/operator/actions";

/**
 * Guards a confirm button against double taps: the first press locks until
 * the action returns. On rejection the reason is shown and the lock released.
 */
export function useSubmit(onSuccess: (r: Extract<ActionResult, { ok: true }>) => void) {
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (run: () => ActionResult) => {
    if (busy.current) return;
    busy.current = true;
    const r = run();
    if (r.ok) {
      setError(null);
      onSuccess(r);
      // Stay locked briefly so a bounce can't fire again as the sheet closes.
      setTimeout(() => (busy.current = false), 600);
    } else {
      setError(r.reason);
      busy.current = false;
    }
  };
  return { submit, error, setError };
}
