import type { ComponentType, SVGProps } from "react";
import {
  CalendarIcon,
  ChartIcon,
  HomeIcon,
  LiveIcon,
  NewsIcon,
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
  /** Bottom bar only: other sections this tab stands for (e.g. Fixtures also covers Results). */
  alsoActive?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: HomeIcon, inBottomBar: true },
  { href: "/live", label: "Live", icon: LiveIcon, inBottomBar: true },
  { href: "/fixtures", label: "Fixtures", icon: CalendarIcon, inBottomBar: true, alsoActive: ["/results"] },
  { href: "/results", label: "Results", icon: ResultsIcon, inBottomBar: false },
  { href: "/table", label: "Table", icon: TableIcon, inBottomBar: false },
  { href: "/competitions", label: "Leagues", icon: TrophyIcon, inBottomBar: true, alsoActive: ["/table"] },
  { href: "/news", label: "News", icon: NewsIcon, inBottomBar: true },
  { href: "/predictions", label: "Predict", icon: ChartIcon, inBottomBar: false },
  { href: "/register", label: "Register", icon: ShirtIcon, inBottomBar: false },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
