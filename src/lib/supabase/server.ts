import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { operatorBackendConfig } from "@/lib/operator/backend";

/** Per-request Supabase client acting as the signed-in user (RLS applies). */
export async function createSupabaseServerClient() {
  const cfg = operatorBackendConfig();
  if (!cfg.ok || cfg.kind !== "supabase") throw new Error("Supabase operator backend is not configured");
  const store = await cookies();
  return createServerClient(cfg.url, cfg.publishableKey, {
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
