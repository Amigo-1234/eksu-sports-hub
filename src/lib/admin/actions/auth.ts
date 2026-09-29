"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionState } from "../types";

export async function signOutAdmin(): Promise<void> {
  const db = await createSupabaseServerClient();
  await db.auth.signOut();
  redirect("/admin/login");
}

/**
 * Exchanges a one-time invite/recovery token for a session. Runs on POST (a
 * button press), so link scanners that prefetch the URL cannot consume it.
 */
export async function confirmToken(_: ActionState, fd: FormData): Promise<ActionState> {
  const tokenHash = String(fd.get("token_hash") ?? "");
  const type = String(fd.get("type") ?? "");
  if (!tokenHash || (type !== "invite" && type !== "recovery")) return { ok: false, error: "This link is incomplete.", at: Date.now() };
  const db = await createSupabaseServerClient();
  const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return { ok: false, error: "This link has expired or was already used. Ask an administrator for a new one.", at: Date.now() };
  redirect("/auth/set-password");
}

export async function setPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 10) return { ok: false, error: "Use at least 10 characters.", at: Date.now() };
  if (password !== confirm) return { ok: false, error: "The two passwords do not match.", at: Date.now() };
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return { ok: false, error: "Your link session has expired. Ask an administrator for a new link.", at: Date.now() };
  const { error } = await db.auth.updateUser({ password });
  if (error) {
    const weak = /weak|short|character/i.test(error.message);
    return { ok: false, error: weak ? "Choose a stronger password." : "Could not save the password. Try again.", at: Date.now() };
  }
  return { ok: true, message: "Password saved. You can now sign in.", at: Date.now() };
}
