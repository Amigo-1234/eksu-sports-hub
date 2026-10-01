import type { Metadata } from "next";
import { NotificationsManager } from "@/components/notifications/NotificationsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Alerts",
  description: "Manage live match alerts for the teams and matches you follow on this device.",
  robots: { index: false },
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl pb-4">
      <PageHeader title="Alerts" subtitle="Live match notifications on this device" />
      <NotificationsManager />
    </div>
  );
}
