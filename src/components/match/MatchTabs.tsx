"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * WAI-ARIA tabs: arrow keys / Home / End move between tabs, only the active
 * tab is in the tab order, and panels are labelled by their tab.
 */
export function MatchTabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Match information"
        onKeyDown={onKeyDown}
        className="sticky top-[calc(var(--header-h)+5px)] z-30 -mx-3 flex border-b border-line bg-canvas/95 px-3 backdrop-blur sm:mx-0 sm:px-0"
      >
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${uid}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={`relative h-12 flex-1 text-[13px] font-bold tracking-wide uppercase transition-colors sm:flex-none sm:px-6 ${
                selected ? "text-brand-700" : "text-ink-faint hover:text-ink"
              }`}
            >
              {t.label}
              <span
                aria-hidden="true"
                className={`absolute inset-x-3 -bottom-px h-[3px] rounded-t ${selected ? "bg-brand-700" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${uid}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
          className="pt-4 focus-visible:outline-offset-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
