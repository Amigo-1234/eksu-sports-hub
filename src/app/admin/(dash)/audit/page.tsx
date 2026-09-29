import type { Metadata } from "next";
import Link from "next/link";
import { JsonDiff } from "@/components/admin/JsonDiff";
import { btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { auditFacets, listAudit } from "@/lib/admin/data/audit";
import { listStaff } from "@/lib/admin/data/staff";
import { formatWatDateTime } from "@/lib/admin/time";
import type { AuditFilters } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Audit Log" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const UUID = /^[0-9a-f-]{36}$/i;

/** Read-only. The database rejects any UPDATE/DELETE on audit_log, even from its owner. */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const f: AuditFilters = {
    actor: one(sp.actor) && UUID.test(one(sp.actor)!) ? one(sp.actor) : undefined,
    action: one(sp.action),
    entity: one(sp.entity),
    match: one(sp.match) && UUID.test(one(sp.match)!) ? one(sp.match) : undefined,
    from: one(sp.from),
    to: one(sp.to),
    page: Math.max(0, Number(one(sp.page) ?? 0) || 0),
  };
  const [{ rows, hasMore }, facets, staff] = await Promise.all([listAudit(f), auditFacets(), listStaff()]);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && k !== "page") p.set(k, String(v));
    if (page) p.set("page", String(page));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageTitle title="Audit Log" description="Every privileged change, with who, when, and what changed. Entries can never be edited or deleted." />
      <Card className="mb-6">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Actor">
            <select name="actor" defaultValue={f.actor ?? ""} className={selectCls}>
              <option value="">Anyone</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <select name="action" defaultValue={f.action ?? ""} className={selectCls}>
              <option value="">Any</option>
              {facets.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type">
            <select name="entity" defaultValue={f.entity ?? ""} className={selectCls}>
              <option value="">Any</option>
              {facets.entities.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Match id">
            <input name="match" defaultValue={f.match} placeholder="Paste a match id" className={`${inputCls} font-mono text-xs`} />
          </Field>
          <Field label="From (WAT)">
            <input type="date" name="from" defaultValue={f.from} className={inputCls} />
          </Field>
          <Field label="To (WAT)">
            <input type="date" name="to" defaultValue={f.to} className={inputCls} />
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button className={btn.primary}>Filter</button>
            <Link href="/admin/audit" className={btn.secondary}>
              Clear
            </Link>
          </div>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <Empty title="No audit entries match" />
        ) : (
          <ol className="divide-y divide-line">
            {rows.map((a) => (
              <li key={a.id} className="py-3">
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-xs whitespace-nowrap text-ink-muted tabular-nums">{formatWatDateTime(a.created_at)}</span>
                      <span className="font-mono text-sm font-bold">{a.action}</span>
                      <span className="text-sm">{a.actor?.display_name ?? <span className="text-ink-faint">system</span>}</span>
                      <span className="text-xs break-all text-ink-muted">
                        {a.entity_type}
                        {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ""}
                      </span>
                      {a.match_id && (
                        <Link href={`/admin/matches/${a.match_id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                          Match →
                        </Link>
                      )}
                    </div>
                  </summary>
                  <div className="mt-2 rounded-lg border border-line bg-canvas p-2">
                    <JsonDiff before={a.before_state} after={a.after_state} />
                    {a.entity_id && <p className="mt-2 font-mono text-[11px] break-all text-ink-faint">entity {a.entity_id}</p>}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
        <nav aria-label="Pages" className="mt-4 flex justify-between gap-2">
          {f.page ? (
            <Link href={`/admin/audit${qs(f.page - 1)}`} className={btn.secondary}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/admin/audit${qs((f.page ?? 0) + 1)}`} className={btn.secondary}>
              Older →
            </Link>
          )}
        </nav>
      </Card>
    </>
  );
}
