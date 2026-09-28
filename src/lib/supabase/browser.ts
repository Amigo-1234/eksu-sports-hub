"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { operatorBackendConfig } from "@/lib/operator/backend";

let client: SupabaseClient | null = null;

/** Browser Supabase client (session in cookies, shared with the server). */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const cfg = operatorBackendConfig();
  if (!cfg.ok || cfg.kind !== "supabase") throw new Error("Supabase operator backend is not configured");
  client = createBrowserClient(cfg.url, cfg.publishableKey);
  return client;
}
