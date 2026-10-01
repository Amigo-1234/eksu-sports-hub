"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon } from "@/components/ui/icons";
import { useAlerts } from "./AlertsProvider";

export function HeaderAlertsLink() {
  const alerts = useAlerts();
  const active = usePathname() === "/notifications";
  if (!alerts.available) return null;
  return (
    <Link
      href="/notifications"
      aria-label={alerts.pushOn ? "Alerts (on)" : "Alerts"}
      aria-current={active ? "page" : undefined}
      className={`relative grid size-10 shrink-0 place-items-center rounded-full ${
        active ? "bg-brand-700 text-white" : "text-ink-muted hover:bg-subtle hover:text-ink"
      }`}
    >
      <BellIcon size={21} filled={alerts.pushOn && !active} className={alerts.pushOn && !active ? "text-brand-700" : undefined} />
    </Link>
  );
}
