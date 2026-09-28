"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Press-and-hold confirmation for high-consequence actions. A tap does
 * nothing; the action fires only after the button is held for `durationMs`.
 * Works with pointer (touch/mouse) and keyboard (hold Space or Enter).
 */
export function HoldButton({
  label,
  onConfirm,
  tone = "brand",
  durationMs = 1500,
  disabled = false,
  hint = "Press and hold to confirm",
}: {
  label: string;
  onConfirm: () => void;
  tone?: "brand" | "danger" | "go";
  durationMs?: number;
  disabled?: boolean;
  hint?: string;
}) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const fired = useRef(false);
  const hintId = useId();

  const cancel = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    start.current = null;
    if (!fired.current) setProgress(0);
  };

  const tick = (t: number) => {
    if (start.current === null) start.current = t;
    const p = Math.min(1, (t - start.current) / durationMs);
    setProgress(p);
    if (p >= 1) {
      if (!fired.current) {
        fired.current = true;
        navigator.vibrate?.(40);
        onConfirm();
      }
      raf.current = null;
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (disabled || fired.current || raf.current) return;
    start.current = null;
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  const colours = {
    brand: "bg-brand-700 text-white",
    danger: "bg-live text-white",
    go: "bg-win text-white",
  }[tone];

  const holding = progress > 0 && progress < 1;

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          begin();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") cancel();
        }}
        className={`relative flex h-16 w-full touch-none items-center justify-center overflow-hidden rounded-xl text-lg font-extrabold tracking-wide uppercase select-none [-webkit-touch-callout:none] disabled:opacity-40 ${colours}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-black/25"
          style={{ width: `${progress * 100}%` }}
        />
        <span className="relative">{progress >= 1 ? "Confirmed" : holding ? "Keep holding…" : label}</span>
      </button>
      <p id={hintId} className="mt-1.5 text-center text-xs font-medium text-ink-muted">
        {hint}
      </p>
    </div>
  );
}
