"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  disableAllAlerts,
  getAlertState,
  removeMatchAlerts,
  saveMatchAlerts,
  saveSubscription,
  saveTeamAlerts,
  unfollowTeam as unfollowTeamAction,
  type ActionResult,
} from "@/app/(public)/notifications/actions";
import { EMPTY_STATE, isAppleMobile, type NotificationState, type PrefKey, type PushSupport } from "@/lib/notifications/prefs";
import { IosInstallSheet } from "./IosInstallSheet";
import {
  currentPermission,
  currentSupport,
  ensureSubscription,
  existingSubscription,
  registerWorker,
  reportPushFailure,
  requestPermission,
  store,
  type Permission,
} from "./push-client";

/*
 * Match alerts, client side. One provider for the public app:
 * - knows whether this browser can receive Web Push (and why not),
 * - holds this device's follows (server-authoritative; cached for first paint),
 * - runs the explain → confirm → permission → subscribe → save flow,
 * - quietly repairs a lost/rotated subscription once a day,
 * - owns the single iOS "Add to Home Screen" sheet and the toast.
 */

export type EnableResult = { ok: true } | { ok: false; reason: "ios-install" | "unsupported" | "denied" | "dismissed" | "error"; message?: string };

interface AlertsContext {
  /** Feature switched on for this deployment (flag + VAPID key + live data). */
  available: boolean;
  /** null until mounted in the browser. */
  support: PushSupport | null;
  permission: Permission;
  state: NotificationState;
  loaded: boolean;
  /** Permission granted and the server holds a live subscription for this device. */
  pushOn: boolean;
  enablePush: () => Promise<EnableResult>;
  saveMatch: (matchId: string, enabled: boolean, events: PrefKey[]) => Promise<boolean>;
  removeMatch: (matchId: string) => Promise<boolean>;
  saveTeam: (teamId: string, events: PrefKey[]) => Promise<boolean>;
  unfollowTeam: (teamId: string) => Promise<boolean>;
  disableAll: () => Promise<boolean>;
  refresh: () => Promise<void>;
  showIosInstall: () => void;
  toast: (message: string) => void;
}

const Ctx = createContext<AlertsContext | null>(null);

const DAY = 24 * 60 * 60 * 1000;

function readCachedState(): NotificationState | null {
  try {
    const raw = store("state");
    return raw ? (JSON.parse(raw) as NotificationState) : null;
  } catch {
    return null;
  }
}

export function AlertsProvider({ available, vapidKey, children }: { available: boolean; vapidKey: string; children: ReactNode }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [permission, setPermission] = useState<Permission>("default");
  const [state, setState] = useState<NotificationState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const platform = useRef<{ platform: string; standalone: boolean }>({ platform: "other", standalone: false });

  const toast = useCallback((message: string) => {
    setToastMsg(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4500);
  }, []);

  const accept = useCallback((r: ActionResult): boolean => {
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    setState(r.state);
    store("known", "1");
    store("state", JSON.stringify(r.state));
    return true;
  }, [toast]);

  const refresh = useCallback(async () => {
    const r = await getAlertState().catch(() => null);
    if (r?.ok) {
      setState(r.state);
      store("state", JSON.stringify(r.state));
    }
    setLoaded(true);
  }, []);

  // Mount: detect support, load cached → server state, repair the subscription.
  useEffect(() => {
    if (!available) return;
    const { support: s, env, platform: p } = currentSupport();
    platform.current = { platform: p, standalone: env.standalone };
    const perm = currentPermission();
    const known = store("known") === "1";
    const cached = known ? readCachedState() : null;
    let cancelled = false;

    // Browser APIs only exist after mount; sync them into state once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(s);
    setPermission(perm);
    if (cached) setState(cached);

    (async () => {
      if (s.kind === "supported") await registerWorker();
      if (!known) {
        if (!cancelled) setLoaded(true);
      } else {
        const r = await getAlertState().catch(() => null);
        if (cancelled) return;
        if (r?.ok) {
          setState(r.state);
          store("state", JSON.stringify(r.state));
        }
        setLoaded(true);
        // Daily repair: a cleared/rotated subscription is re-created and re-saved.
        if (s.kind === "supported" && perm === "granted" && vapidKey) {
          const last = Number(store("synced") ?? 0);
          const sub = await existingSubscription();
          if (!sub || Date.now() - last > DAY || (r?.ok && !r.state.push_enabled)) {
            try {
              const json = await ensureSubscription(vapidKey);
              const saved = await saveSubscription(json, p, env.standalone);
              if (!cancelled && saved.ok) {
                setState(saved.state);
                store("state", JSON.stringify(saved.state));
                store("synced", String(Date.now()));
              }
            } catch {
              // Try again next visit; the server keeps the previous subscription.
            }
          }
        }
      }
      // First launch from the iPhone/iPad Home Screen: alerts can now be enabled.
      if (!cancelled && s.kind === "supported" && isAppleMobile(env) && env.standalone && perm === "default" && !store("iosReady")) {
        store("iosReady", "1");
        toast("You're ready to enable live match alerts.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available, vapidKey, toast]);

  // Permission can change in browser settings while the app is open.
  useEffect(() => {
    if (!available) return;
    const sync = () => setPermission(currentPermission());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [available]);

  const pushOn = permission === "granted" && state.push_enabled;

  /** Must be called from a click/tap: the permission prompt needs a user gesture. */
  const enablePush = useCallback(async (): Promise<EnableResult> => {
    const { support: s } = currentSupport();
    if (s.kind === "ios-install") {
      setIosOpen(true);
      return { ok: false, reason: "ios-install" };
    }
    if (s.kind === "unsupported" || !vapidKey) return { ok: false, reason: "unsupported" };
    let perm = currentPermission();
    if (perm === "default") {
      perm = await requestPermission(); // first await: keeps the user activation
      setPermission(perm);
    }
    if (perm === "denied") return { ok: false, reason: "denied" };
    if (perm !== "granted") return { ok: false, reason: "dismissed" };
    try {
      const json = await ensureSubscription(vapidKey);
      const r = await saveSubscription(json, platform.current.platform, platform.current.standalone);
      if (!r.ok) return { ok: false, reason: "error", message: r.error };
      accept(r);
      store("synced", String(Date.now()));
      return { ok: true };
    } catch (err) {
      reportPushFailure(err, platform.current);
      return { ok: false, reason: "error", message: "Your browser could not set up notifications. Please try again." };
    }
  }, [vapidKey, accept]);

  const saveMatch = useCallback(async (id: string, enabled: boolean, events: PrefKey[]) => accept(await saveMatchAlerts(id, enabled, events)), [accept]);
  const removeMatch = useCallback(async (id: string) => accept(await removeMatchAlerts(id)), [accept]);
  const saveTeam = useCallback(async (id: string, events: PrefKey[]) => accept(await saveTeamAlerts(id, events)), [accept]);
  const unfollowTeam = useCallback(async (id: string) => accept(await unfollowTeamAction(id)), [accept]);

  const disableAll = useCallback(async () => {
    const r = await disableAllAlerts();
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    const sub = await existingSubscription();
    await sub?.unsubscribe().catch(() => undefined);
    setState(EMPTY_STATE);
    store("state", null);
    store("known", null);
    store("synced", null);
    return true;
  }, [toast]);

  const value = useMemo<AlertsContext>(
    () => ({
      available,
      support,
      permission,
      state,
      loaded,
      pushOn,
      enablePush,
      saveMatch,
      removeMatch,
      saveTeam,
      unfollowTeam,
      disableAll,
      refresh,
      showIosInstall: () => setIosOpen(true),
      toast,
    }),
    [available, support, permission, state, loaded, pushOn, enablePush, saveMatch, removeMatch, saveTeam, unfollowTeam, disableAll, refresh, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {available && (
        <>
          <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] z-50 flex justify-center px-4 md:bottom-6"
          >
            {toastMsg && (
              <p className="pointer-events-auto max-w-sm rounded-xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white shadow-lg" data-testid="alerts-toast">
                {toastMsg}
              </p>
            )}
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}

const DISABLED: AlertsContext = {
  available: false,
  support: null,
  permission: "default",
  state: EMPTY_STATE,
  loaded: true,
  pushOn: false,
  enablePush: async () => ({ ok: false, reason: "unsupported" }),
  saveMatch: async () => false,
  removeMatch: async () => false,
  saveTeam: async () => false,
  unfollowTeam: async () => false,
  disableAll: async () => false,
  refresh: async () => undefined,
  showIosInstall: () => undefined,
  toast: () => undefined,
};

export function useAlerts(): AlertsContext {
  return useContext(Ctx) ?? DISABLED;
}
