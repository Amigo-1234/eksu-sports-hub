"use client";

import { useEffect } from "react";
import { HEARTBEAT_MS } from "@/lib/audience/types";

/*
 * Tells the server this device is viewing the match page. Renders nothing and
 * never receives audience numbers.
 *
 * - Starts a visit only while the page is visible (background-opened tabs and
 *   prerenders don't count until someone looks at them).
 * - Heartbeat every 20 s while visible. Hidden (tab switched, phone locked):
 *   heartbeats stop, so the device drops out of "watching now" within 50 s;
 *   coming back within 10 min resumes the same visit, later starts a new one.
 * - Page closed / navigated away: a best-effort "end" (sendBeacon). Missing
 *   it is fine — the timeout covers it.
 * - Any failure just stops tracking; the match page is never affected.
 */

const URL_ = "/api/audience";

async function post(body: object): Promise<Response | null> {
  try {
    return await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      keepalive: true,
    });
  } catch {
    return null;
  }
}

function beacon(body: object) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(URL_, new Blob([data], { type: "text/plain" }))) return;
  } catch {
    // fall through
  }
  void post(body);
}

export function AudienceTracker({ matchId }: { matchId: string }) {
  useEffect(() => {
    let session: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let starting = false;
    let failures = 0;
    let stopped = false;

    const stopAll = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    };
    const fail = () => {
      if (++failures >= 3) stopAll();
    };

    async function start() {
      if (starting || stopped) return;
      starting = true;
      try {
        const res = await post({ t: "start", match: matchId });
        if (res?.status === 429 || res?.status === 403 || res?.status === 400) return stopAll();
        if (res?.ok && res.status === 200) {
          const j = (await res.json()) as { session?: string };
          session = j.session ?? null;
          failures = 0;
        } else if (res?.status === 204) {
          stopAll(); // tracking unavailable here (mock data / not configured)
        } else fail();
      } catch {
        fail();
      } finally {
        starting = false;
      }
    }

    async function beat() {
      if (stopped || document.visibilityState !== "visible") return;
      if (!session) return start();
      try {
        const res = await post({ t: "beat", session });
        if (!res?.ok) return fail();
        const j = res.status === 200 ? ((await res.json()) as { restart?: boolean }) : {};
        failures = 0;
        if (j.restart) {
          session = null;
          await start();
        }
      } catch {
        fail();
      }
    }

    const run = () => {
      if (timer || stopped) return;
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const pause = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void beat();
        run();
      } else pause();
    };
    const onPageHide = () => {
      if (session) beacon({ t: "end", session });
      session = null;
      pause();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && document.visibilityState === "visible") onVisibility(); // back/forward cache
    };

    if (document.visibilityState === "visible") {
      void start();
      run();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      if (session) beacon({ t: "end", session }); // client-side navigation away from the match
      stopAll();
    };
  }, [matchId]);

  return null;
}
