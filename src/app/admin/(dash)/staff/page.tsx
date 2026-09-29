import type { Metadata } from "next";
import Link from "next/link";
import { InviteForm } from "@/components/admin/LinkForms";
import { Badge, Card, Empty, PageTitle, TableWrap, td, th } from "@/components/admin/ui";
import { staffAccountsConfigured } from "@/lib/admin/authAdmin";
import { listStaff } from "@/lib/admin/data/staff";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Staff & Operators" };

export default async function StaffPage() {
  const staff = await listStaff();
  const canInvite = staffAccountsConfigured();
  return (
    <>
      <PageTitle title="Staff & Operators" description="Accounts are created without passwords: each person sets their own through a one-time link. Passwords are never visible to administrators." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title={`${staff.length} account${staff.length === 1 ? "" : "s"}`}>
          {staff.length === 0 ? (
            <Empty title="No staff accounts" />
          ) : (
            <TableWrap label="Staff">
              <table className="w-full min-w-[38rem]">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>Name</th>
                    <th className={th}>Roles</th>
                    <th className={th}>Status</th>
                    <th className={th}>Last sign-in</th>
                    <th className={`${th} text-right`}>Assignments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {staff.map((s) => (
                    <tr key={s.user_id} className="hover:bg-subtle">
                      <td className={td}>
                        <Link href={`/admin/staff/${s.user_id}`} className="font-bold text-brand-700 hover:underline">
                          {s.display_name}
                        </Link>
                        <span className="block text-xs break-all text-ink-muted">{s.email}</span>
                      </td>
                      <td className={td}>
                        <span className="flex flex-wrap gap-1">
                          {s.roles.length ? s.roles.map((r) => <Badge key={r} tone={r === "ADMIN" ? "brand" : "neutral"}>{r}</Badge>) : <span className="text-xs text-ink-faint">No role</span>}
                        </span>
                      </td>
                      <td className={td}>
                        {s.deactivated_at ? <Badge tone="bad">Deactivated</Badge> : !s.email_confirmed ? <Badge tone="warn">Invite pending</Badge> : <Badge tone="ok">Active</Badge>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{s.last_sign_in_at ? formatWatDateTime(s.last_sign_in_at) : "Never"}</td>
                      <td className={`${td} text-right tabular-nums`}>{s.active_assignments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
        <Card title="Add staff member">
          {canInvite ? (
            <InviteForm />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-bold text-warn">Account creation is not configured on this server.</p>
              <p className="text-ink-muted">
                Creating accounts needs the Supabase secret key as the server-only environment variable <code className="font-mono">SUPABASE_SECRET_KEY</code> (never
                prefixed <code className="font-mono">NEXT_PUBLIC_</code>). Until it is set, staff can still be managed here once their accounts exist.
              </p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
