"use client";

import { useId, useState, type FormEvent } from "react";
import { setGateStatus, todayWat, writeVisitor } from "@/components/visitor/visitor-store";

/** "What should we call you?" — the light sign-in, inline. */
export function NameForm({ onSignedIn, className = "", label = "Join the banter. What should we call you?" }: {
  onSignedIn: () => void;
  className?: string;
  label?: string;
}) {
  const nameId = useId();
  const [askName, setAskName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  async function join(e: FormEvent) {
    e.preventDefault();
    const n = askName.trim().replace(/\s+/g, " ");
    if (!n) return;
    setNameError(null);
    try {
      const res = await fetch("/api/visitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: "join", name: n, contact: null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setNameError(d.error ?? "Could not save your name. Try again.");
        return;
      }
      writeVisitor({ name: n, seen: todayWat() });
      setGateStatus("done");
      onSignedIn();
    } catch {
      setNameError("You're offline. Try again when you're connected.");
    }
  }

  return (
      <form onSubmit={join} className={className}>
        <label htmlFor={nameId} className="text-sm font-bold">
          {label}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id={nameId}
            value={askName}
            onChange={(e) => setAskName(e.target.value)}
            maxLength={40}
            autoComplete="nickname"
            placeholder="Your name or nickname"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-[16px] outline-none ring-brand-500/30 focus:border-brand-500 focus:ring-2"
          />
          <button type="submit" disabled={!askName.trim()} className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white disabled:opacity-50">
            Continue
          </button>
        </div>
        {nameError && <p className="mt-2 text-sm text-live">{nameError}</p>}
      </form>
    );
  }

