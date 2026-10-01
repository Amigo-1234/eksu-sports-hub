import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { SiteFooter } from "./SiteFooter";
import { AlertsProvider } from "@/components/notifications/AlertsProvider";
import { NavigationTracker } from "@/components/ui/BackLink";
import { DATA_SOURCE_KIND, getMatches } from "@/lib/data";
import { pushNotificationsEnabled } from "@/lib/notifications/server";
import { normaliseVapidKey } from "@/lib/notifications/flag";

async function liveMatchCount(): Promise<number> {
  try {
    return (await getMatches({ scope: "live" })).length;
  } catch {
    // The header must never take the whole app down; pages show their own errors.
    return 0;
  }
}

/** Chrome for the public app: header, content area, footer, bottom nav. */
export async function PublicShell({ children }: { children: ReactNode }) {
  const liveCount = await liveMatchCount();
  // Alerts need real match IDs (live data), the server flag and the public VAPID key.
  const alerts = DATA_SOURCE_KIND === "live" && pushNotificationsEnabled();
  return (
    <AlertsProvider available={alerts} vapidKey={alerts ? normaliseVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) : ""}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent-500 px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader liveCount={liveCount} />
      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-3 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1.5rem)] sm:px-4 md:pb-12"
      >
        {children}
      </main>
      <SiteFooter />
      <BottomNav liveCount={liveCount} />
      <NavigationTracker />
    </AlertsProvider>
  );
}
