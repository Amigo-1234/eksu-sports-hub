import type { ComponentType, SVGProps } from "react";
import {
  CalendarIcon,
  HomeIcon,
  LiveIcon,
  ResultsIcon,
  ShirtIcon,
  TableIcon,
  TrophyIcon,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Shown in the mobile bottom bar (max 5). */
  inBottomBar: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: HomeIcon, inBottomBar: true },
  { href: "/live", label: "Live", icon: LiveIcon, inBottomBar: true },
  { href: "/fixtures", label: "Fixtures", icon: CalendarIcon, inBottomBar: true },
  { href: "/results", label: "Results", icon: ResultsIcon, inBottomBar: true },
  { href: "/table", label: "Table", icon: TableIcon, inBottomBar: true },
  { href: "/competitions", label: "Competitions", icon: TrophyIcon, inBottomBar: false },
  { href: "/register", label: "Register", icon: ShirtIcon, inBottomBar: false },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
