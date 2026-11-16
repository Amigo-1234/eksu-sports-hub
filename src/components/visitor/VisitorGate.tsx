"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import crest from "../../../public/brand/eksu-crest-192.png";
import { CONTACT_MAX, NAME_MAX, cleanContact, cleanName, type VisitorState } from "@/lib/visitor/types";
import { gateStatus, readVisitor, setGateStatus, subscribeGate, todayWat, writeVisitor } from "./visitor-store";

/** Pages where a full-screen welcome would get in the way of a task. */
const SKIP_PATHS = [/^\/register(\/|$)/, /^\/teams\/[^/]+\/welcome\/?$/];
const BACKDROP = "/news/2026-11-15-downfall-school-gate-ft/lead.jpg";

async function api(body?: unknown): Promise<{
  ok: boolean;
  status: number;
  data: VisitorState & { error?: string };
}> {
  const res = await fetch(
    "/api/visitor",
    body
      ? {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }
      : { cache: "no-store" },
  );
  const data = await res.json().catch(() => ({ known: false }));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Light sign-in for the public site: "What should we call you?" plus an
 * optional email or phone number. Not an account — the name is attached to the
 * browser's anonymous device cookie so the team can see who uses the site.
 * Returning visitors are recognised from localStorage (no flash) and counted
 * once a day.
 */
export function VisitorGate({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const status = useSyncExternalStore(subscribeGate, gateStatus, () => "done" as const);

  useEffect(() => {
    if (!enabled) {
      setGateStatus("done");
      return;
    }
    let cancelled = false;
    const cached = readVisitor();
    (async () => {
      try {
        if (cached) {
          const today = todayWat();
          if (cached.seen === today) return;
          const r = await api({ t: "seen" });
          if (cancelled) return;
          if (r.ok && !r.data.known) {
            // Cookie cleared but we still know the name: sign this browser in again.
            const j = await api({
              t: "join",
              name: cached.name,
              contact: null,
            });
            if (!j.ok) return;
          }
          if (r.ok) writeVisitor({ name: cached.name, seen: today });
          return;
        }
        const r = await api();
        if (cancelled) return;
        if (r.ok && r.data.known && r.data.name) {
          writeVisitor({ name: r.data.name, seen: todayWat() });
          setGateStatus("done");
        } else {
          setGateStatus(r.ok ? "needed" : "done");
        }
      } catch {
        if (!cancelled && !cached) setGateStatus("done"); // offline: never block the site
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (status !== "needed" || SKIP_PATHS.some((r) => r.test(pathname))) return null;
  return <Welcome onDone={(name) => (writeVisitor({ name, seen: todayWat() }), setGateStatus("done"))} />;
}

function Welcome({ onDone }: { onDone: (name: string) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    (step === 0 ? nameRef : contactRef).current?.focus({ preventScroll: true });
  }, [step]);

  const validName = cleanName(name);
  const contactValue = cleanContact(contact);

  const submit = async (withContact: boolean) => {
    if (!validName) return;
    if (withContact && contactValue === false) {
      setError("Enter a valid email address or phone number, or tap Skip.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api({
        t: "join",
        name: validName,
        contact: withContact ? contactValue || null : null,
      });
      if (r.ok) onDone(r.data.name ?? validName);
      else if (r.status === 422 || r.status === 429) setError(r.data.error ?? "Please check your details and try again.");
      else onDone(validName); // server unavailable: let them in, we'll count them next time
    } catch {
      onDone(validName);
    } finally {
      setBusy(false);
    }
  };

  const onName = (e: FormEvent) => {
    e.preventDefault();
    if (validName) {
      setError(null);
      setStep(1);
    }
  };
  const onContact = (e: FormEvent) => {
    e.preventDefault();
    void submit(true);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="visitor-title" className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <Image src={BACKDROP} alt="" fill priority sizes="100vw" className="object-cover opacity-45" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black" aria-hidden="true" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2.5">
          <Image src={crest} alt="" width={36} height={36} />
          <span className="font-display text-lg font-extrabold tracking-[0.04em] uppercase">
            EKSU <span className="text-brand-300">Sports</span>
          </span>
        </div>

        <div className="mt-auto">
          <div className="mb-6 flex gap-1.5" aria-hidden="true">
            {[0, 1].map((s) => (
              <span key={s} className={`h-1 rounded-full transition-all duration-300 ${s === step ? "w-8 bg-white" : "w-2 bg-white/35"}`} />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">{`Step ${step + 1} of 2`}</p>

          {step === 0 ? (
            <form onSubmit={onName} noValidate>
              <h1 id="visitor-title" className="text-[28px] leading-tight font-bold">
                What should we call you?
              </h1>
              <label htmlFor="visitor-name" className="sr-only">
                Your name
              </label>
              <input
                id="visitor-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                autoComplete="given-name"
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="Your name"
                className="mt-6 w-full border-0 border-b border-white/30 bg-transparent px-0 py-3 text-xl text-white placeholder:text-white/40 focus:border-white focus:ring-0 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!validName}
                className="mt-8 flex h-14 w-full items-center justify-center gap-2 bg-brand-600 text-[15px] font-bold tracking-[0.12em] uppercase transition-colors hover:bg-brand-500 disabled:bg-brand-700/60 disabled:text-white/45"
              >
                Continue <span aria-hidden="true">›</span>
              </button>
            </form>
          ) : (
            <form onSubmit={onContact} noValidate>
              <h1 id="visitor-title" className="text-[28px] leading-tight font-bold">
                Hi {validName}! How can we reach you?
              </h1>
              <p className="mt-2 text-sm text-white/65">Email or phone number — optional.</p>
              <label htmlFor="visitor-contact" className="sr-only">
                Email or phone number (optional)
              </label>
              <input
                id="visitor-contact"
                ref={contactRef}
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value);
                  setError(null);
                }}
                maxLength={CONTACT_MAX}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="done"
                placeholder="you@example.com or 080…"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "visitor-error" : undefined}
                className="mt-5 w-full border-0 border-b border-white/30 bg-transparent px-0 py-3 text-xl text-white placeholder:text-white/40 focus:border-white focus:ring-0 focus:outline-none"
              />
              {error && (
                <p id="visitor-error" role="alert" className="mt-3 text-sm text-brand-200">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !contact.trim()}
                className="mt-8 flex h-14 w-full items-center justify-center gap-2 bg-brand-600 text-[15px] font-bold tracking-[0.12em] uppercase transition-colors hover:bg-brand-500 disabled:bg-brand-700/60 disabled:text-white/45"
              >
                {busy ? "Saving…" : "Continue"} <span aria-hidden="true">›</span>
              </button>
              <div className="mt-3 flex items-center justify-between">
                <button type="button" onClick={() => setStep(0)} className="h-11 text-sm font-semibold text-white/65 hover:text-white">
                  ‹ Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(false)}
                  className="h-11 text-sm font-semibold text-white/80 hover:text-white"
                >
                  Skip
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-xs leading-relaxed text-white/50">
            No password, no account. Only the EKSU Sports Hub team can see your name and contact; we use them to understand who uses the
            site and never show them publicly.
          </p>
        </div>
      </div>
    </div>
  );
}
