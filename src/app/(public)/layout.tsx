import type { Viewport } from "next";
import { PublicShell } from "@/components/layout/PublicShell";

/** The public app is dark; match the browser UI to the header chrome. */
export const viewport: Viewport = { themeColor: "#08090b" };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
