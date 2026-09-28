"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Notice {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(n: Omit<Notice, "id">) => void>(() => {});

/** Non-blocking confirmation strip, announced politely to screen readers. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const notify = useCallback((n: Omit<Notice, "id">) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++seq.current;
    setNotice({ ...n, id });
    timer.current = setTimeout(() => setNotice((cur) => (cur?.id === id ? null : cur)), n.action ? 6000 : 3500);
  }, []);

  const tone = {
    success: "bg-ink text-white",
    error: "bg-live text-white",
    info: "bg-ink text-white",
  };

  return (
    <Ctx.Provider value={notify}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {notice && (
          <div
            key={notice.id}
            className={`pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${tone[notice.tone]}`}
          >
            <span aria-hidden="true" className="text-lg font-black">
              {notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold">{notice.message}</p>
            {notice.action && (
              <button
                type="button"
                onClick={() => {
                  notice.action?.run();
                  setNotice(null);
                }}
                className="h-11 shrink-0 rounded-lg bg-white/15 px-4 text-sm font-extrabold uppercase hover:bg-white/25"
              >
                {notice.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useFeedback = () => useContext(Ctx);
