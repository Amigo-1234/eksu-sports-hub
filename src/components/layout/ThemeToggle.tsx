"use client";

import { useState } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { THEME_CLASS, THEME_COOKIE, type SiteTheme } from "@/lib/theme";

/** Saves the choice for the server (next visit) and flips the class on this page now. */
function persistTheme(t: SiteTheme) {
  document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.querySelector("[data-theme-root]")?.classList.toggle(THEME_CLASS, t === "dark");
}

/**
 * Switches the public site between the default light theme and dark. The
 * choice lives in a cookie so the server renders the right theme on the next
 * visit (no flash); the class flips immediately for this page.
 */
export function ThemeToggle({ initial, className = "", variant = "icon" }: { initial: SiteTheme; className?: string; variant?: "icon" | "row" }) {
  const [theme, setTheme] = useState<SiteTheme>(initial);
  const next: SiteTheme = theme === "dark" ? "light" : "dark";
  const apply = (t: SiteTheme) => {
    persistTheme(t);
    setTheme(t);
  };
  if (variant === "row") {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2 shadow-card ${className}`}>
        <span className="text-sm font-semibold">Appearance</span>
        <div role="radiogroup" aria-label="Appearance" className="flex rounded-full bg-subtle p-0.5">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => apply(t)}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                theme === t ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t === "light" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={next === "dark" ? "Switch to dark theme" : "Switch to light theme"}
      title={next === "dark" ? "Dark theme" : "Light theme"}
      className={`grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink min-[400px]:size-10 ${className}`}
    >
      {theme === "dark" ? <SunIcon size={19} /> : <MoonIcon size={19} />}
    </button>
  );
}
