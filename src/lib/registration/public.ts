import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/* Open registration windows, read anonymously (publishable key) and always fresh: windows open and close. */

export interface PublicWindow {
  id: string;
  slug: string;
  title: string;
  opens_at: string;
  closes_at: string | null;
  allow_player: boolean;
  allow_team: boolean;
  competition: { id: string; name: string; short_name: string };
  season: { id: string; name: string };
}

export interface RegTeam {
  id: string;
  name: string;
  short_name: string;
  faculty_id: string | null;
  department_id: string | null;
}
export interface RegFaculty {
  id: string;
  name: string;
  code: string;
  departments: { id: string; name: string }[];
}
export interface PublicWindowDetail extends PublicWindow {
  instructions: string;
  teams: RegTeam[];
  faculties: RegFaculty[];
}

function anon() {
  const env = supabaseEnv();
  if (!env.ok) throw new Error(env.error);
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export async function getOpenWindows(): Promise<PublicWindow[]> {
  const { data, error } = await anon().rpc("public_registration_windows");
  if (error) throw new Error("Could not load registration windows.");
  return (data as PublicWindow[] | null) ?? [];
}

export async function getOpenWindow(slug: string): Promise<PublicWindowDetail | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const { data, error } = await anon().rpc("public_registration_window", { p_slug: slug });
  if (error) throw new Error("Could not load this registration.");
  return (data as PublicWindowDetail | null) ?? null;
}
