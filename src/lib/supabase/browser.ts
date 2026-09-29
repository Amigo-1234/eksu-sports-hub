"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/** Browser Supabase client (session in cookies, shared with the server). */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const env = supabaseEnv();
  if (!env.ok) throw new Error(env.error);
  client = createBrowserClient(env.url, env.publishableKey);
  return client;
}
