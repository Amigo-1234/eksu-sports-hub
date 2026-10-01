"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy reference" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          window.prompt("Copy your reference:", text);
        }
      }}
      className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong bg-surface px-5 text-sm font-bold hover:bg-subtle"
    >
      <span aria-live="polite">{copied ? "Copied ✓" : label}</span>
    </button>
  );
}
