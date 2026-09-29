import type { Metadata } from "next";
import Link from "next/link";
import { Badge, btn, Card, PageTitle } from "@/components/admin/ui";
import { staffAccountsConfigured } from "@/lib/admin/authAdmin";
import { listSeasons } from "@/lib/admin/data/reference";
import { requireAdmin } from "@/lib/admin/permissions";
import { formatDateOnly } from "@/lib/admin/time";
import { operatorBackendConfig } from "@/lib/operator/backend";

export const metadata: Metadata = { title: "Settings" };

/** Only settings that exist in the system — no placeholder toggles. */
export default async function SettingsPage() {
  const [admin, seasons] = await Promise.all([requireAdmin(), listSeasons()]);
  const current = seasons.find((s) => s.is_current);
  const op = operatorBackendConfig();
  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    } catch {
      return "not set";
    }
  })();
  const rows: [string, React.ReactNode][] = [
    ["Signed in as", `${admin.displayName} (${admin.email})`],
    ["Database", supabaseHost],
    ["Operator console backend", op.ok ? op.kind : <Badge tone="bad">Not configured</Badge>],
    ["Staff account creation", staffAccountsConfigured() ? <Badge tone="ok">Available</Badge> : <Badge tone="warn">Needs SUPABASE_SECRET_KEY</Badge>],
    ["Match times", "Campus time — West Africa Time (Africa/Lagos, UTC+1). Stored as UTC timestamps."],
    ["Public sign-up", "Disabled. Accounts are created by administrators only."],
  ];
  return (
    <>
      <PageTitle title="Settings" description="Operational settings that exist in the system today." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Current season" actions={<Link href="/admin/seasons" className={btn.ghost}>Manage seasons →</Link>}>
          {current ? (
            <p>
              <span className="font-bold">{current.name}</span>
              <span className="block text-sm text-ink-muted">
                {formatDateOnly(current.starts_on)} – {formatDateOnly(current.ends_on)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-warn">No season is marked current.</p>
          )}
        </Card>
        <Card title="System">
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
