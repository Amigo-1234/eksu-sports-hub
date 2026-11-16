"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/*
 * "New article" dot for the News tab. Purely local: the browser remembers the
 * publication time of the newest article it has seen (localStorage), so no
 * account or server state is needed. A first-time visitor starts "caught up";
 * only articles published after that light the dot. Opening any /news page
 * marks everything up to the newest article as seen. Separate from match
 * push notifications.
 */

const KEY = "eksu-news-seen-v1";
const listeners = new Set<() => void>();

function readSeen(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function markSeen(t: number) {
  try {
    const cur = readSeen();
    if (cur === null || t > cur) localStorage.setItem(KEY, String(t));
  } catch {
    /* private mode: no dot then */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

/** `latest` = publication time (ms) of the newest published article, from the server. */
export function useNewsUnread(latest: number | null): boolean {
  const pathname = usePathname();
  const onNews = pathname === "/news" || pathname.startsWith("/news/");
  const seen = useSyncExternalStore(subscribe, readSeen, () => null);

  useEffect(() => {
    if (!latest) return;
    if (onNews || readSeen() === null) markSeen(latest);
  }, [latest, onNews]);

  return !!latest && !onNews && seen !== null && latest > seen;
}

export function NewsDot({ latest, className = "" }: { latest: number | null; className?: string }) {
  const unread = useNewsUnread(latest);
  if (!unread) return null;
  return (
    <span className={`absolute size-2.5 rounded-full bg-live ring-2 ring-chrome ${className}`}>
      <span className="sr-only">New article</span>
    </span>
  );
}
