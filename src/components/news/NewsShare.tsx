"use client";

import { useEffect, useState } from "react";
import { FacebookLogo, FACEBOOK_BLUE, WhatsAppLogo, WHATSAPP_GREEN, XLogo } from "@/components/ui/brand-icons";
import { CheckIcon, LinkIcon, ShareIcon } from "@/components/ui/icons";

/** Share an article: native share sheet where available, plus WhatsApp, X, Facebook and copy link. */
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
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ backgroundColor: WHATSAPP_GREEN }}
        className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white transition-[filter] hover:brightness-95"
      >
        <WhatsAppLogo size={18} /> WhatsApp
      </a>
      <a
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Post on X"
        className="grid size-10 place-items-center rounded-full bg-black text-white ring-1 ring-white/15 transition-opacity hover:opacity-85"
      >
        <XLogo size={16} />
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        className="grid size-10 place-items-center rounded-full transition-opacity hover:opacity-85"
        style={{ color: FACEBOOK_BLUE }}
      >
        <FacebookLogo size={40} />
      </a>
      <button type="button" onClick={copy} className={btn} aria-live="polite">
        {copied ? <CheckIcon size={16} className="text-win" /> : <LinkIcon size={16} />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
