import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Per-request Supabase client acting as the signed-in user (RLS applies). */
export async function createSupabaseServerClient() {
  const env = supabaseEnv();
  if (!env.ok) throw new Error(env.error);
  const store = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
