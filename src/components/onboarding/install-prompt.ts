"use client";

/*
 * Native PWA install prompt (Chrome/Edge/Samsung on Android and desktop).
 * `beforeinstallprompt` can fire before React hydrates, so an inline script in
 * the public shell (INSTALL_CAPTURE_SCRIPT) stashes it on window; this module
 * picks it up and keeps listening for later events.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __eksuInstallPrompt?: BeforeInstallPromptEvent | null;
    __eksuInstalled?: boolean;
  }
}

/** Runs during HTML parsing, before hydration. Keep it tiny and dependency-free. */
export const INSTALL_CAPTURE_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__eksuInstallPrompt=e;window.dispatchEvent(new Event("eksu:installprompt"));});window.addEventListener("appinstalled",function(){window.__eksuInstallPrompt=null;window.__eksuInstalled=true;window.dispatchEvent(new Event("eksu:installprompt"));});}catch(e){}})();`;

export function installPrompt(): BeforeInstallPromptEvent | null {
  return typeof window === "undefined" ? null : (window.__eksuInstallPrompt ?? null);
}

export function onInstallPromptChange(cb: () => void): () => void {
  window.addEventListener("eksu:installprompt", cb);
  return () => window.removeEventListener("eksu:installprompt", cb);
}

/** Already running as an installed app (Home Screen / standalone window), or installed this session. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.__eksuInstalled === true ||
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches === true
  );
}

/** Shows the native install dialog. Resolves to whether the visitor accepted. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = installPrompt();
  if (!e) return "unavailable";
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    window.__eksuInstallPrompt = null; // a prompt event can only be used once
    if (outcome === "accepted") window.__eksuInstalled = true;
    return outcome;
  } catch {
    return "unavailable";
  }
}

/** iOS browser other than Safari (Chrome/Firefox/Edge on iPhone) — Add to Home Screen lives in Safari's Share sheet. */
export function isIosNonSafari(ua: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

export const ONBOARDING_KEY = "eksu-onboarding-v1";
export const OPEN_ONBOARDING_EVENT = "eksu:open-onboarding";

export function onboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_KEY, "done");
  } catch {
    /* private mode — nothing to persist */
  }
}
