"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import crest from "../../../public/brand/eksu-crest-192.png";
import { useAlerts, type EnableResult } from "@/components/notifications/AlertsProvider";
import { platformOf } from "@/lib/notifications/prefs";
import { BallIcon, BellIcon, CheckIcon, DownloadIcon, PlusSquareIcon, ShareIcon } from "@/components/ui/icons";
import {
  OPEN_ONBOARDING_EVENT,
  installPrompt,
  isInstalled,
  isIosNonSafari,
  markOnboardingDone,
  onInstallPromptChange,
  onboardingDone,
  promptInstall,
} from "./install-prompt";
import { gateStatus, subscribeGate } from "@/components/visitor/visitor-store";

type Step = "intro" | "install" | "alerts" | "welcome";

/** Pages where a first-visit overlay would get in the way of a task. */
const SKIP_PATHS = [/^\/register(\/|$)/, /^\/notifications(\/|$)/];

/**
 * First-visit onboarding for the public site: logo intro → install the app →
 * match alerts → welcome. Not a sign-up. Shown once per device (localStorage),
 * re-openable from the site via OPEN_ONBOARDING_EVENT or `?welcome=1`.
 */
const welcomeRequested = () => new URLSearchParams(window.location.search).get("welcome") === "1";

export function Onboarding() {
  const pathname = usePathname();
  // null = follow the first-visit rule; otherwise an explicit open/close by the visitor.
  const [manual, setManual] = useState<"open" | "closed" | null>(null);
  // Waits for the light sign-in ("What should we call you?") so the overlays never stack.
  const firstVisit = useSyncExternalStore(
    subscribeGate,
    () =>
      welcomeRequested() ||
      (gateStatus() === "done" && !onboardingDone() && !SKIP_PATHS.some((r) => r.test(window.location.pathname))),
    () => false, // server render: never (no flash for returning visitors)
  );
  const open = manual === "open" || (manual === null && firstVisit && !SKIP_PATHS.some((r) => r.test(pathname)));

  useEffect(() => {
    const reopen = () => setManual("open");
    window.addEventListener(OPEN_ONBOARDING_EVENT, reopen);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, reopen);
  }, []);

  const close = useCallback(() => {
    markOnboardingDone();
    setManual("closed");
    if (welcomeRequested()) {
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);

  if (!open) return null;
  // Re-opened on purpose (button or ?welcome=1): go straight to the useful slides.
  return <Slides onClose={close} skipIntro={manual === "open" || welcomeRequested()} />;
}

function useInstallState() {
  const subscribe = useCallback((cb: () => void) => onInstallPromptChange(cb), []);
  const canPrompt = useSyncExternalStore(subscribe, () => installPrompt() !== null, () => false);
  const installed = useSyncExternalStore(subscribe, isInstalled, () => false);
  return { canPrompt, installed };
}

function Slides({ onClose, skipIntro }: { onClose: () => void; skipIntro: boolean }) {
  const alerts = useAlerts();
  const { canPrompt, installed } = useInstallState();
  const [ua] = useState(() => navigator.userAgent);
  const platform = platformOf({ userAgent: ua, maxTouchPoints: navigator.maxTouchPoints ?? 0 });

  // Steps are fixed when the dialog opens, so the pager does not jump around.
  const [steps] = useState<Step[]>(() => {
    const s: Step[] = skipIntro ? [] : ["intro"];
    if (!isInstalled()) s.push("install");
    s.push("alerts", "welcome");
    return s;
  });
  const [i, setI] = useState(0);
  const step = steps[i];
  const next = useCallback(() => setI((n) => Math.min(n + 1, steps.length - 1)), [steps.length]);
  const pagerSteps = steps.filter((s) => s !== "intro");

  // Logo intro advances by itself.
  useEffect(() => {
    if (step !== "intro") return;
    const t = setTimeout(next, matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : 1900);
    return () => clearTimeout(t);
  }, [step, next]);

  // Modal behaviour: lock page scroll, Escape closes, focus moves into the dialog.
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>(`[data-step="${step}"] [data-autofocus]`)?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to EKSU Sports Hub"
        className="relative flex max-h-[100dvh] w-full flex-col overflow-hidden bg-surface text-ink shadow-2xl motion-safe:animate-[onb-rise_.35s_ease-out] max-sm:rounded-t-3xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="h-1 shrink-0 bg-brand-700" aria-hidden="true">
          <div className="h-full w-1/4 bg-accent-500" />
        </div>
        {step !== "intro" && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 h-9 rounded-full px-3 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink"
          >
            Skip
          </button>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${i * 100}%)` }}
          >
            {steps.map((s, idx) => (
              <section
                key={s}
                data-step={s}
                aria-hidden={idx !== i}
                inert={idx !== i}
                className="flex w-full shrink-0 flex-col overflow-y-auto px-6 pt-10 pb-4"
              >
                {s === "intro" && <Intro onSkip={next} />}
                {s === "install" && (
                  <InstallStep platform={platform} ua={ua} canPrompt={canPrompt} installed={installed} onNext={next} />
                )}
                {s === "alerts" && <AlertsStep alerts={alerts} platform={platform} installed={installed} onNext={next} />}
                {s === "welcome" && <WelcomeStep onEnter={onClose} />}
              </section>
            ))}
          </div>
        </div>

        {step !== "intro" && (
          <div className="flex shrink-0 justify-center gap-1.5 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-hidden="true">
            {pagerSteps.map((s) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? "w-6 bg-brand-700" : "w-1.5 bg-line-strong"}`}
              />
            ))}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {step === "intro" ? "" : `Step ${pagerSteps.indexOf(step) + 1} of ${pagerSteps.length}`}
        </p>
      </div>
    </div>
  );
}

/* ── Slides ────────────────────────────────────────────────────────────── */

function Intro({ onSkip }: { onSkip: () => void }) {
  return (
    <button type="button" onClick={onSkip} className="flex flex-1 flex-col items-center justify-center py-10 text-center" aria-label="Continue">
      <span className="relative grid size-36 place-items-center">
        <span className="absolute inset-0 rounded-full bg-brand-700/10 motion-safe:animate-[onb-pulse_1.8s_ease-out_infinite]" aria-hidden="true" />
        <span className="absolute inset-3 rounded-full bg-brand-700/10" aria-hidden="true" />
        <Image src={crest} alt="" width={104} height={104} priority className="relative motion-safe:animate-[onb-pop_.7s_cubic-bezier(.2,.9,.3,1.3)_both]" />
      </span>
      <span className="mt-6 font-display text-[34px] leading-none font-extrabold tracking-[0.04em] uppercase motion-safe:animate-[onb-up_.6s_.35s_ease-out_both]">
        EKSU <span className="text-brand-fg">Sports</span>
      </span>
      <span className="mt-2 text-sm font-medium text-ink-muted motion-safe:animate-[onb-up_.6s_.55s_ease-out_both]">Live scores · Fixtures · Results</span>
    </button>
  );
}

function StepHeading({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <div className="mx-auto">{icon}</div>
      <h2 className="mt-5 font-display text-[28px] leading-tight font-extrabold tracking-[0.01em] uppercase">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-autofocus
      onClick={onClick}
      disabled={disabled}
      className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 h-11 w-full rounded-2xl text-[15px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink">
      {children}
    </button>
  );
}

/** Phone with the app icon on its Home Screen. */
function InstallArt() {
  return (
    <div className="relative mx-auto h-40 w-28 rounded-[1.6rem] border-[5px] border-ink bg-subtle shadow-lg" aria-hidden="true">
      <div className="absolute top-1.5 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-ink" />
      <div className="grid grid-cols-3 gap-2 px-3 pt-7">
        {Array.from({ length: 6 }, (_, k) =>
          k === 4 ? (
            <span key={k} className="grid aspect-square place-items-center rounded-lg bg-white shadow ring-2 ring-brand-600 motion-safe:animate-[onb-pop_.6s_.2s_both]">
              <Image src={crest} alt="" width={22} height={22} />
            </span>
          ) : (
            <span key={k} className="aspect-square rounded-lg bg-line-strong/70" />
          ),
        )}
      </div>
    </div>
  );
}

function InstallStep({
  platform,
  ua,
  canPrompt,
  installed,
  onNext,
}: {
  platform: ReturnType<typeof platformOf>;
  ua: string;
  canPrompt: boolean;
  installed: boolean;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function install() {
    setBusy(true);
    const r = await promptInstall();
    setBusy(false);
    if (r === "accepted") onNext();
    else if (r === "dismissed") setNote("No problem — you can install it any time from your browser menu.");
    else setNote("Use your browser menu to install the app.");
  }

  return (
    <div className="flex flex-1 flex-col">
      <StepHeading icon={<InstallArt />} title="Get the best experience">
        Install EKSU Sports Hub on your device for quicker access to live scores, fixtures, results and match updates.
      </StepHeading>

      <div className="mt-6 flex-1">
        {installed ? (
          <p className="flex items-center justify-center gap-2 rounded-2xl bg-win/10 px-4 py-3 text-sm font-semibold text-win">
            <CheckIcon size={18} /> EKSU Sports Hub is installed on this device
          </p>
        ) : platform === "ios" ? (
          <IosGuide nonSafari={isIosNonSafari(ua)} />
        ) : canPrompt ? null : (
          <p className="rounded-2xl bg-subtle px-4 py-3 text-center text-sm text-ink-muted">
            {platform === "android"
              ? "Open your browser menu (⋮) and tap “Install app” or “Add to Home screen”."
              : "Use the install icon in your browser’s address bar, or its menu → “Install EKSU Sports Hub”."}
          </p>
        )}
        {note && <p className="mt-3 text-center text-sm text-ink-muted" role="status">{note}</p>}
      </div>

      <div className="mt-6">
        {!installed && platform !== "ios" && canPrompt ? (
          <PrimaryButton onClick={install} disabled={busy}>
            <DownloadIcon size={19} /> {busy ? "Opening…" : "Install app"}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={onNext}>{installed ? "Continue" : "Next"}</PrimaryButton>
        )}
        {!installed && <SecondaryButton onClick={onNext}>Skip for now</SecondaryButton>}
      </div>
    </div>
  );
}

function IosGuide({ nonSafari }: { nonSafari: boolean }) {
  const steps: { icon: ReactNode; text: ReactNode }[] = [
    { icon: <span className="text-base">🧭</span>, text: <>Open this website in <b>Safari</b>{nonSafari ? " (copy the link from this browser)" : ""}</> },
    { icon: <ShareIcon size={18} />, text: <>Tap the <b>Share</b> icon</> },
    { icon: <PlusSquareIcon size={18} />, text: <>Choose <b>Add to Home Screen</b></> },
    { icon: <span className="text-sm font-bold">Add</span>, text: <>Tap <b>Add</b> — EKSU Sports Hub opens straight from your Home Screen</> },
  ];
  return (
    <ol className="space-y-2">
      {steps.map((s, k) => (
        <li key={k} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">{k + 1}</span>
          <span className="min-w-0 flex-1 text-sm">{s.text}</span>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-brand-fg" aria-hidden="true">
            {s.icon}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Bell with a sample alert card (no real team or score). */
function AlertsArt({ on }: { on: boolean }) {
  return (
    <div className="relative mx-auto h-40 w-60" aria-hidden="true">
      <span className="absolute top-2 left-1/2 grid size-20 -translate-x-1/2 place-items-center rounded-full bg-brand-700 text-white shadow-lg motion-safe:animate-[onb-ring_2.4s_ease-in-out_infinite]">
        <BellIcon size={36} filled={on} />
      </span>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left shadow-lg motion-safe:animate-[onb-up_.6s_.3s_ease-out_both]">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle">
          <Image src={crest} alt="" width={24} height={24} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-xs font-bold tracking-wide text-live uppercase">
            <BallIcon size={12} /> Goal!
          </span>
          <span className="block truncate text-[13px] text-ink-muted">Your team just scored — tap for the match</span>
        </span>
      </div>
    </div>
  );
}

const ENABLE_MESSAGE: Record<Exclude<EnableResult, { ok: true }>["reason"], string> = {
  "ios-install": "On iPhone, alerts work once EKSU Sports Hub is on your Home Screen. Add it (previous step), open it from there, then turn alerts on.",
  unsupported: "This browser can’t receive notifications. Try Chrome, Edge or Firefox — or Safari from the Home Screen on iPhone.",
  denied: "Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.",
  dismissed: "No problem — you can turn alerts on later from the bell icon.",
  error: "Something went wrong turning alerts on. Please try again.",
};

function AlertsStep({
  alerts,
  platform,
  installed,
  onNext,
}: {
  alerts: ReturnType<typeof useAlerts>;
  platform: ReturnType<typeof platformOf>;
  installed: boolean;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const on = alerts.pushOn;

  const unavailable = !alerts.available;
  const iosNeedsInstall = platform === "ios" && !installed;
  const blocked = alerts.permission === "denied";

  async function enable() {
    setBusy(true);
    setMsg(null);
    const r = await alerts.enablePush();
    setBusy(false);
    if (r.ok) setMsg(null);
    else setMsg(r.message ?? ENABLE_MESSAGE[r.reason]);
  }

  const detail = useMemo(() => {
    if (unavailable) return "Match alerts aren’t switched on for this site yet.";
    if (on) return "Alerts are on for this device. Tap the bell on any match, or Follow a team, to choose what you hear about.";
    if (iosNeedsInstall) return ENABLE_MESSAGE["ios-install"];
    if (blocked) return ENABLE_MESSAGE.denied;
    return null;
  }, [unavailable, on, iosNeedsInstall, blocked]);

  return (
    <div className="flex flex-1 flex-col">
      <StepHeading icon={<AlertsArt on={on} />} title="Never miss a moment">
        Stay updated whenever your favourite teams are playing. Receive live match alerts, goals, results and important match updates.
      </StepHeading>

      <div className="mt-6 flex-1">
        {on && (
          <p className="flex items-center justify-center gap-2 rounded-2xl bg-win/10 px-4 py-3 text-sm font-semibold text-win">
            <CheckIcon size={18} /> Notifications are on
          </p>
        )}
        {(detail || msg) && (
          <p className={`rounded-2xl bg-subtle px-4 py-3 text-center text-sm text-ink-muted ${on ? "mt-2" : ""}`} role="status">
            {msg ?? detail}
          </p>
        )}
      </div>

      <div className="mt-6">
        {on || unavailable || iosNeedsInstall || blocked ? (
          <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
        ) : (
          <>
            <PrimaryButton onClick={enable} disabled={busy}>
              <BellIcon size={19} /> {busy ? "Turning on…" : "Enable notifications"}
            </PrimaryButton>
            <SecondaryButton onClick={onNext}>Not now</SecondaryButton>
          </>
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <StepHeading
        icon={
          <span className="relative mx-auto grid size-32 place-items-center" aria-hidden="true">
            <span className="absolute inset-0 rotate-6 rounded-[2rem] bg-accent-500/20" />
            <span className="absolute inset-0 -rotate-6 rounded-[2rem] bg-brand-700/15" />
            <Image src={crest} alt="" width={92} height={92} className="relative" />
          </span>
        }
        title="Welcome to EKSU Sports Hub"
      >
        Your home for everything happening in EKSU sports. Follow matches, explore competitions, check results and stay connected with your teams.
      </StepHeading>
      <div className="flex-1" />
      <div className="mt-8">
        <PrimaryButton onClick={onEnter}>Enter Sports Hub</PrimaryButton>
      </div>
    </div>
  );
}

/** Re-opens the onboarding (install guide + alerts) from anywhere on the site. */
export function OpenOnboardingButton({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT))}>
      {children}
    </button>
  );
}
