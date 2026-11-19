"use client";

import { useState } from "react";

/**
 * Article text, folded to a preview so the comments sit close to the top.
 * The full text stays in the page (for search engines and screen readers);
 * "See more" just unfolds it. Short stories are shown in full.
 */
export function StoryBody({ paragraphs }: { paragraphs: string[] }) {
  const words = paragraphs.join(" ").split(/\s+/).length;
  const foldable = words > 90 && paragraphs.length > 1;
  const [open, setOpen] = useState(!foldable);
  return (
    <div className="mt-5">
      <div id="story-text" className={`relative space-y-5 text-[17px] leading-[1.75] text-ink ${open ? "" : "max-h-[13.5rem] overflow-hidden"}`}>
        {paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {!open && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas to-transparent" />}
      </div>
      {foldable && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="story-text"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink shadow-card hover:bg-subtle"
        >
          {open ? "See less" : "See more"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className={open ? "rotate-180" : ""}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
