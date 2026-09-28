import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { NavigationTracker } from "@/components/ui/BackLink";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { getMatches } from "@/lib/data";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EKSU Sports Hub — Live scores, fixtures & tables",
    template: "%s · EKSU Sports Hub",
  },
  description:
    "Live scores, fixtures, results and tables for Ekiti State University sport.",
  applicationName: "EKSU Sports Hub",
  appleWebApp: { capable: true, title: "EKSU Sports", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#5c1025",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function liveMatchCount(): Promise<number> {
  try {
    return (await getMatches({ scope: "live" })).length;
  } catch {
    // The header must never take the whole app down; pages show their own errors.
    return 0;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const liveCount = await liveMatchCount();
  return (
    <html lang="en-NG" className={`${inter.variable} ${barlow.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
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
      </body>
    </html>
  );
}
