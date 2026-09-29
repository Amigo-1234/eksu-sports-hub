import type { Metadata } from "next";
import Link from "next/link";
import { AssignForm } from "@/components/admin/AssignForm";
import { Badge, btn, Card, Empty, PageTitle, StatusBadge } from "@/components/admin/ui";
import { listMatches } from "@/lib/admin/data/matches";
import { listAssignableOperators } from "@/lib/admin/data/staff";
import { dateKey } from "@/lib/format";
import { formatWatDateTime, serverNow } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage({ searchParams }: PageProps<"/admin/assignments">) {
  const sp = await searchParams;
  const onlyMissing = sp.show !== "all";
  const now = serverNow();
  const [scheduled, live, operators] = await Promise.all([
    listMatches({ status: "scheduled", from: dateKey(now) }, 300),
    listMatches({ status: "live" }),
    listAssignableOperators(),
  ]);
  const all = [...live.rows, ...scheduled.rows];
  const rows = onlyMissing ? all.filter((m) => !m.assignments.some((a) => a.role === "PRIMARY")) : all;
  const load = new Map<string, number>();
  for (const m of all) for (const a of m.assignments) load.set(a.user_id, (load.get(a.user_id) ?? 0) + 1);

  return (
    <>
      <PageTitle
        title="Assignments"
        description="Give every upcoming fixture a primary operator (and optionally a backup). Only the assigned operators see the match in the operator console."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/assignments" aria-current={onlyMissing ? "page" : undefined} className={onlyMissing ? btn.primary : btn.secondary}>
          Needs a primary ({all.filter((m) => !m.assignments.some((a) => a.role === "PRIMARY")).length})
        </Link>
        <Link href="/admin/assignments?show=all" aria-current={!onlyMissing ? "page" : undefined} className={!onlyMissing ? btn.primary : btn.secondary}>
          All upcoming & live ({all.length})
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          {operators.length === 0 ? (
            <Empty title="No active operators" action={<Link href="/admin/staff" className={btn.primary}>Invite staff</Link>}>
              Invite staff with the OPERATOR role before assigning matches.
            </Empty>
          ) : rows.length === 0 ? (
            <Empty title={onlyMissing ? "Every upcoming fixture has a primary operator" : "No upcoming fixtures"} />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((m) => {
                const primary = m.assignments.find((a) => a.role === "PRIMARY");
                const backup = m.assignments.find((a) => a.role === "BACKUP");
                const soon = !primary && Date.parse(m.scheduled_at) - now < 3 * 3600_000;
                return (
                  <li key={m.id} className="py-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Link href={`/admin/matches/${m.id}`} className="font-bold text-brand-700 hover:underline">
                        {m.home.short_name} v {m.away.short_name}
                      </Link>
                      <StatusBadge status={m.status} />
                      {soon && <Badge tone="bad">Kick-off soon · no primary</Badge>}
                      <span className="w-full text-xs text-ink-muted">
                        {formatWatDateTime(m.scheduled_at)} · {m.competition.short_name} · {m.venue?.short_name ?? "Venue TBC"}
                      </span>
                    </div>
                    <AssignForm matchId={m.id} operators={operators} primary={primary?.user_id} backup={backup?.user_id} compact />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Operator load" description="Active assignments on upcoming and live fixtures.">
          {operators.length === 0 ? (
            <p className="text-sm text-ink-muted">No operators.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {operators.map((o) => (
                <li key={o.user_id} className="flex justify-between gap-2">
                  <Link href={`/admin/staff/${o.user_id}`} className="truncate hover:underline">
                    {o.display_name}
                  </Link>
                  <span className="font-bold tabular-nums">{load.get(o.user_id) ?? 0}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
