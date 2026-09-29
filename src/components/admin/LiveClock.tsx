"use client";

import { useEffect, useState } from "react";
import { clockLabel, type ClockSnap } from "@/lib/admin/clock";

/** Read-only ticking match minute; starts from the server-rendered label. */
export function LiveClock({ match, serverNow, initial }: { match: ClockSnap; serverNow: number; initial: string }) {
  const [label, setLabel] = useState(initial);
  useEffect(() => {
    const skew = serverNow - Date.now();
    const tick = () => setLabel(clockLabel(match, Date.now() + skew));
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [match, serverNow]);
  return <span className="tabular-nums">{label}</span>;
}
