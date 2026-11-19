"use client";

import { useEffect, useRef, useState } from "react";
import { WhatsAppLogo, WHATSAPP_GREEN } from "@/components/ui/brand-icons";
import { DownloadIcon, ShareIcon } from "@/components/ui/icons";

/**
 * "Share to Status": opens the phone's share sheet with the match card image
 * (WhatsApp → My Status). Where files can't be shared, shows the image with
 * Save and a WhatsApp text share instead.
 */
export function ShareMatchCard({ matchId, title, finished }: { matchId: string; title: string; finished: boolean }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const src = `/matches/${matchId}/card?format=status`;
  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}/matches/${matchId}`;
  const text = `${title} — live scores on EKSU Sports Hub`;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (preview && !d.open) d.showModal();
    if (!preview && d.open) d.close();
  }, [preview]);

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(src, { cache: "no-store" });
      const blob = await res.blob();
      const file = new File([blob], `eksu-${matchId.slice(0, 8)}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${pageUrl}` });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // closed the share sheet
    } finally {
      setBusy(false);
    }
    setPreview(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        style={{ backgroundColor: WHATSAPP_GREEN }}
        className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white transition-[filter] hover:brightness-95 disabled:opacity-70"
      >
        <WhatsAppLogo size={18} />
        {busy ? "Preparing…" : finished ? "Share result" : "Share"}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setPreview(false)}
        onClick={(e) => e.target === dialog.current && setPreview(false)}
        aria-label="Share card"
        className="m-auto w-[min(92vw,24rem)] rounded-2xl bg-canvas p-3 text-ink backdrop:bg-black/60"
      >
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- generated PNG, shown as-is
          <img src={src} alt={`${title} share card`} className="aspect-[9/16] w-full rounded-xl bg-subtle object-cover" />
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={src} download={`eksu-${matchId.slice(0, 8)}.png`} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-bold">
            <DownloadIcon size={16} /> Save image
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${pageUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: WHATSAPP_GREEN }}
            className="flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white"
          >
            <WhatsAppLogo size={17} /> WhatsApp
          </a>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
          <ShareIcon size={13} /> Save the image, then post it to your WhatsApp Status.
        </p>
        <button type="button" onClick={() => setPreview(false)} className="mt-2 h-10 w-full rounded-xl text-sm font-bold text-ink-muted hover:bg-subtle">
          Close
        </button>
      </dialog>
    </>
  );
}
