"use client";

import { useState } from "react";
import { ShareIcon } from "@/components/ui/icons";

/** Native share sheet on phones (WhatsApp etc.); copies the link elsewhere. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* share sheet dismissed */
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-subtle"
    >
      <ShareIcon size={15} />
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
