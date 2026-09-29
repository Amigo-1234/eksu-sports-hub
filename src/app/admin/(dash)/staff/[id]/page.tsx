import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { ResetLinkForm } from "@/components/admin/LinkForms";
import { Badge, btn, Card, Empty, PageTitle, StatusBadge } from "@/components/admin/ui";
import { grantRole, revokeRole, setStaffActive } from "@/lib/admin/actions/staff";
import { staffAccountsConfigured } from "@/lib/admin/authAdmin";
import { listStaff, listStaffAssignments } from "@/lib/admin/data/staff";
import { requireAdmin } from "@/lib/admin/permissions";
import { formatWatDateTime } from "@/lib/admin/time";
import { STAFF_ROLES } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Staff member" };

export default async function StaffMemberPage({ params }: PageProps<"/admin/staff/[id]">) {
  const { id } = await params;
  const [me, staff, assignments] = await Promise.all([requireAdmin(), listStaff(), listStaffAssignments(id)]);
  const s = staff.find((x) => x.user_id === id);
  if (!s) notFound();
  const self = me.id === s.user_id;
  const active = assignments.filter((a) => a.active);
  return (
    <>
      <PageTitle
        title={s.display_name}
        back={{ href: "/admin/staff", label: "Staff" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-all">{s.email}</span>
            {s.deactivated_at ? <Badge tone="bad">Deactivated</Badge> : !s.email_confirmed ? <Badge tone="warn">Invite pending</Badge> : <Badge tone="ok">Active</Badge>}
            {self && <Badge tone="brand">You</Badge>}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card title="Roles" description="Changes are re-checked and audited by the database. You cannot remove your own ADMIN role.">
            <ul className="divide-y divide-line">
              {STAFF_ROLES.map((r) => {
                const has = s.roles.includes(r);
                return (
                  <li key={r} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm">
                      <Badge tone={has ? (r === "ADMIN" ? "brand" : "ok") : "muted"}>{r}</Badge>{" "}
                      <span className="text-ink-muted">{has ? "Granted" : "Not granted"}</span>
                    </span>
                    {has ? (
                      !(self && r === "ADMIN") && (
                        <ConfirmAction
                          action={revokeRole}
                          hidden={{ user_id: s.user_id, role: r }}
                          trigger="Remove"
                          triggerClass={btn.small}
                          title={`Remove ${r} from ${s.display_name}?`}
                          body={r === "OPERATOR" && active.length ? `They still have ${active.length} active assignment(s); they will lose access to those matches.` : undefined}
                          confirmLabel="Remove role"
                        />
                      )
                    ) : r === "ADMIN" ? (
                      <ConfirmAction
                        action={grantRole}
                        hidden={{ user_id: s.user_id, role: r }}
                        trigger="Grant"
                        triggerClass={btn.small}
                        tone="primary"
                        title={`Make ${s.display_name} an administrator?`}
                        body="Administrators have full access to this dashboard, including staff and roles."
                        confirmLabel="Grant ADMIN"
                        typeToConfirm="ADMIN"
                      />
                    ) : (
                      <ActionForm action={grantRole}>
                        <input type="hidden" name="user_id" value={s.user_id} />
                        <input type="hidden" name="role" value={r} />
                        <Submit className={btn.small}>Grant</Submit>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Account">
            <div className="space-y-4">
              {!self && (
                <ConfirmAction
                  action={setStaffActive}
                  hidden={{ user_id: s.user_id, active: s.deactivated_at ? "1" : "0" }}
                  trigger={s.deactivated_at ? "Reactivate account" : "Deactivate account"}
                  triggerClass={s.deactivated_at ? btn.primary : btn.danger}
                  tone={s.deactivated_at ? "primary" : "danger"}
                  title={s.deactivated_at ? `Reactivate ${s.display_name}?` : `Deactivate ${s.display_name}?`}
                  body={
                    s.deactivated_at
                      ? "Their roles work again and they can sign in."
                      : "All their roles stop working immediately, they are removed from control of any live match, and sign-in is blocked. Their history is kept."
                  }
                  confirmLabel={s.deactivated_at ? "Reactivate" : "Deactivate"}
                />
              )}
              {staffAccountsConfigured() ? (
                <div>
                  <p className="mb-2 text-sm text-ink-muted">Forgotten password or expired invite? Create a one-time link for them to set a new password.</p>
                  <ResetLinkForm email={s.email} />
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Password links need SUPABASE_SECRET_KEY on the server (see Staff page).</p>
              )}
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-ink-muted">Created</dt>
                <dd>{formatWatDateTime(s.created_at)}</dd>
                <dt className="text-ink-muted">Last sign-in</dt>
                <dd>{s.last_sign_in_at ? formatWatDateTime(s.last_sign_in_at) : "Never"}</dd>
              </dl>
            </div>
          </Card>
        </div>
        <Card title="Assignments" description={`${active.length} active`}>
          {assignments.length === 0 ? (
            <Empty title="No assignments" />
          ) : (
            <ul className="divide-y divide-line">
              {assignments.map((a, i) => (
                <li key={i} className={`py-2 ${a.active ? "" : "opacity-60"}`}>
                  <Link href={`/admin/matches/${a.match.id}`} className="font-bold text-brand-700 hover:underline">
                    {a.match.home.short_name} v {a.match.away.short_name}
                  </Link>{" "}
                  <StatusBadge status={a.match.status} /> <Badge tone={a.role === "PRIMARY" ? "brand" : "neutral"}>{a.role}</Badge>
                  {!a.active && <Badge tone="muted">Removed</Badge>}
                  <p className="text-xs text-ink-muted">
                    {formatWatDateTime(a.match.scheduled_at)} · {a.match.competition.short_name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
