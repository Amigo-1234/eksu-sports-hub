"use client";

import { useState } from "react";

/** Copy / WhatsApp share for a team's public welcome link (admin team page). */
export function ShareWelcomeLink({ url, teamName }: { url: string; teamName: string }) {
  const [copied, setCopied] = useState(false);
  const message = `Congratulations ${teamName}! 🎉 Your team is now on EKSU Sports Hub. Open your welcome page: ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("welcome-link") as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <label htmlFor="welcome-link" className="sr-only">
        Welcome link
      </label>
      <input
        id="welcome-link"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white hover:brightness-95"
        >
          Share via WhatsApp
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-semibold hover:bg-subtle"
        >
          Preview
        </a>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </p>
    </div>
  );
}
