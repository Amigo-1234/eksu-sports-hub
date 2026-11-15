import type { Viewport } from "next";
import { PublicShell } from "@/components/layout/PublicShell";

/** Light by default: match the browser UI to the white header. */
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
