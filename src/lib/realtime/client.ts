"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Public realtime: anonymous, cookie-less (never touches a staff session),
 * listen-only. Channels are private; RLS on realtime.messages allows the
 * public to receive `scores:live` and `match:{id}` but never to send.
 *
 * Messages are hints only. Every consumer refetches canonical state and
 * treats a hint's payload as "something changed at seq N".
 */
let client: SupabaseClient | null = null;

export function publicClient(): SupabaseClient | null {
  if (client) return client;
  const env = supabaseEnv();
  if (!env.ok) return null;
  client = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "eksu-public-realtime" },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

export interface Hint {
  match_id: string;
  seq: number;
  kind?: string;
  status?: string;
}

export type ChannelState = "connecting" | "live" | "offline";

/**
 * Subscribe to hints on a topic. `onState(state, resubscribed)` reports
 * connection changes; `resubscribed` is true when a dropped channel came back
 * (callers must refetch — missed messages are never replayed).
 */
export function subscribeHints(
  topic: string,
  onHint: (hint: Hint) => void,
  onState: (state: ChannelState, resubscribed: boolean) => void,
): () => void {
  const c = publicClient();
  if (!c) {
    onState("offline", false);
    return () => {};
  }
  let subscribedBefore = false;
  onState("connecting", false);
  const channel = c
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "match_changed" }, (msg) => {
      const p = msg.payload as Partial<Hint> | undefined;
      if (p && typeof p.match_id === "string" && Number.isFinite(Number(p.seq))) {
        onHint({ match_id: p.match_id, seq: Number(p.seq), kind: p.kind, status: p.status });
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onState("live", subscribedBefore);
        subscribedBefore = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onState("offline", false);
      }
    });
  return () => {
    void c.removeChannel(channel);
  };
}

/** Calls `fn` on focus/visibility regain and when the network returns. */
export function onResume(fn: () => void): () => void {
  const vis = () => document.visibilityState === "visible" && fn();
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("online", fn);
  return () => {
    document.removeEventListener("visibilitychange", vis);
    window.removeEventListener("online", fn);
  };
}
