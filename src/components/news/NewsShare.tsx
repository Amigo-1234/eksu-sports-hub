"use client";

import { useEffect, useState } from "react";
import { ShareIcon } from "@/components/ui/icons";

/** Share an article: native share sheet where available, plus WhatsApp, X and copy link. */
export function NewsShare({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after hydration
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const text = `${title} — EKSU Sports Hub`;
  const btn =
    "inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-subtle";

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* cancelled */
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this article" role="group">
      {canShare && (
        <button type="button" onClick={nativeShare} className={btn}>
          <ShareIcon size={16} /> Share
        </button>
      )}
      <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer" className={btn}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="#25D366">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
        </svg>
        WhatsApp
      </a>
      <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className={btn}>
        <span aria-hidden="true" className="font-black">𝕏</span> Post
      </a>
      <button type="button" onClick={copy} className={btn} aria-live="polite">
        {copied ? "Link copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
