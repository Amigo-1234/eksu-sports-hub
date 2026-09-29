export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "trophy" | "calendar" | "shield" | "shirt" | "users" | "clipboard" | "live" | "table" | "log" | "settings" | "season" | "building" | "pin";
}

export const NAV: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard" },
      { href: "/admin/live", label: "Live Matches", icon: "live" },
    ],
  },
  {
    heading: "Match day",
    items: [
      { href: "/admin/matches", label: "Fixtures / Matches", icon: "calendar" },
      { href: "/admin/assignments", label: "Assignments", icon: "clipboard" },
      { href: "/admin/standings", label: "Standings", icon: "table" },
    ],
  },
  {
    heading: "Structure",
    items: [
      { href: "/admin/competitions", label: "Competitions", icon: "trophy" },
      { href: "/admin/teams", label: "Teams", icon: "shield" },
      { href: "/admin/players", label: "Players", icon: "shirt" },
      { href: "/admin/seasons", label: "Seasons", icon: "season" },
      { href: "/admin/faculties", label: "Faculties & Departments", icon: "building" },
      { href: "/admin/venues", label: "Venues", icon: "pin" },
    ],
  },
  {
    heading: "People & records",
    items: [
      { href: "/admin/staff", label: "Staff & Operators", icon: "users" },
      { href: "/admin/audit", label: "Audit Log", icon: "log" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
