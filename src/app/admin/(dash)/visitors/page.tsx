import type { Metadata } from "next";
import Link from "next/link";
import { btn, Card, Empty, inputCls, PageTitle, TableWrap, td, th } from "@/components/admin/ui";
import { listVisitors } from "@/lib/admin/data/visitors";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Site Visitors" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : undefined);

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 font-display text-4xl leading-none font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

/** People who told the public site their name. Contacts are personal data: admins only, never public. */
export default async function VisitorsPage({ searchParams }: PageProps<"/admin/visitors">) {
  const sp = await searchParams;
  const q = one(sp.q);
  const page = Math.max(0, Number(one(sp.page) ?? 0) || 0);
  const { totals, rows, hasMore } = await listVisitors(q, page);
  const qs = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (p) s.set("page", String(p));
    const v = s.toString();
    return v ? `?${v}` : "";
  };

  return (
    <>
      <PageTitle
        title="Site Visitors"
        description="People who signed in on the public site with “What should we call you?”. Visits are counted once per day (WAT). Personal data: do not share outside the Sports Hub team."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={totals.visitors} />
        <Stat label="Visited today" value={totals.today} />
        <Stat label="Last 7 days" value={totals.last_7_days} />
        <Stat label="New this week" value={totals.new_last_7_days} />
        <Stat label="Left a contact" value={totals.with_contact} />
      </div>
      <Card>
        <form className="mb-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name, email or phone" className={inputCls} aria-label="Search visitors" />
          <button className={btn.primary}>Search</button>
          {q && (
            <Link href="/admin/visitors" className={btn.secondary}>
              Clear
            </Link>
          )}
        </form>
        {rows.length === 0 ? (
          <Empty title={q ? "No visitors match" : "No visitors yet"} />
        ) : (
          <TableWrap label="Site visitors">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Contact</th>
                  <th className={`${th} text-right`}>Visit days</th>
                  <th className={th}>Last seen</th>
                  <th className={th}>First seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v, i) => (
                  <tr key={`${v.first_seen_at}-${i}`}>
                    <td className={`${td} font-semibold`}>{v.name}</td>
                    <td className={`${td} break-all`}>{v.contact ?? <span className="text-ink-faint">—</span>}</td>
                    <td className={`${td} text-right tabular-nums`}>{v.visit_days}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatWatDateTime(v.last_seen_at)}</td>
                    <td className={`${td} whitespace-nowrap text-ink-muted`}>{formatWatDateTime(v.first_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <nav aria-label="Pages" className="mt-4 flex justify-between gap-2">
          {page ? (
            <Link href={`/admin/visitors${qs(page - 1)}`} className={btn.secondary}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/admin/visitors${qs(page + 1)}`} className={btn.secondary}>
              Next →
            </Link>
          )}
        </nav>
      </Card>
    </>
  );
}
