import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { THEME_CLASS, THEME_COOKIE, parseTheme } from "@/lib/theme";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { SiteFooter } from "./SiteFooter";
import { AlertsProvider } from "@/components/notifications/AlertsProvider";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { VisitorGate } from "@/components/visitor/VisitorGate";
import { INSTALL_CAPTURE_SCRIPT } from "@/components/onboarding/install-prompt";
import { NavigationTracker } from "@/components/ui/BackLink";
import { DATA_SOURCE_KIND, getMatches } from "@/lib/data";
import { pushNotificationsEnabled } from "@/lib/notifications/server";
import { getNews } from "@/lib/news/source";

async function liveMatchCount(): Promise<number> {
  try {
    return (await getMatches({ scope: "live" })).length;
  } catch {
    // The header must never take the whole app down; pages show their own errors.
    return 0;
  }
}

/** Publication time of the newest published article (drives the News "new" dot). */
async function latestNewsAt(): Promise<number | null> {
  try {
    const t = Date.parse((await getNews({ page: 1, limit: 1 })).items[0]?.publishedAt ?? "");
    return Number.isNaN(t) ? null : t;
  } catch {
    return null; // news must never take the shell down
  }
}

/** Chrome for the public app: header, content area, footer, bottom nav. */
export async function PublicShell({ children }: { children: ReactNode }) {
  const [liveCount, jar, latestNews] = await Promise.all([liveMatchCount(), cookies(), latestNewsAt()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  // Alerts need real match IDs (live data) and the server flag; the VAPID key comes from Vault.
  const alerts = DATA_SOURCE_KIND === "live" && pushNotificationsEnabled();
  // The light sign-in needs live data and the server-only service key.
  const visitors = DATA_SOURCE_KIND === "live" && Boolean(process.env.SUPABASE_SECRET_KEY);
  return (
    <div data-theme-root className={`${theme === "dark" ? THEME_CLASS : ""} flex min-h-dvh flex-col bg-canvas text-ink`}>
    <AlertsProvider available={alerts}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent-500 px-4 py-2 font-semibold text-canvas focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader liveCount={liveCount} theme={theme} latestNews={latestNews} />
      <main
        id="main"
        className="mx-auto w-full max-w-7xl flex-1 px-3 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1.25rem)] sm:px-4 lg:pb-12"
      >
        {children}
      </main>
      <SiteFooter />
      <BottomNav liveCount={liveCount} latestNews={latestNews} />
      <NavigationTracker />
      <VisitorGate enabled={visitors} />
      <Onboarding />
      {/* Capture the native install prompt before hydration (it can fire early). */}
      <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
    </AlertsProvider>
    </div>
  );
}
