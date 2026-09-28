"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Email + password sign-in (Supabase Auth). The page only needs a session;
 * swapping to phone OTP later means replacing this form, not the backend.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setError(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
          setBusy(false);
          return;
        }
        router.replace(next);
        router.refresh();
      }}
    >
      {error && (
        <p role="alert" className="rounded-lg border-2 border-live bg-live-soft px-3 py-2 text-sm font-bold text-live">
          {error}
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Email</span>
        <input
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-14 w-full rounded-xl border-2 border-line-strong bg-surface px-4 text-base focus:border-ink"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-14 w-full rounded-xl border-2 border-line-strong bg-surface px-4 text-base focus:border-ink"
        />
      </label>
      <button type="submit" disabled={busy} className="h-14 w-full rounded-xl bg-brand-700 text-lg font-extrabold text-white uppercase disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
