import type { Metadata } from "next";
import Link from "next/link";
import { Badge, btn, Card, Empty, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { applicationCounts, listApplications } from "@/lib/admin/data/applications";
import { formatWatDateTime } from "@/lib/admin/time";
import { DAYS, dayLabel, periodLabel, STATUS_LABEL, STATUS_TONE as TONE, STATUSES } from "@/lib/operator-applications/shared";

export const metadata: Metadata = { title: "Operator Applications" };

export default async function ApplicationsPage({ searchParams }: PageProps<"/admin/applications">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filters = { q: pick("q"), status: pick("status"), day: pick("day") };
  const [rows, counts] = await Promise.all([listApplications(filters), applicationCounts()]);
  const filtered = Boolean(filters.q || filters.status || filters.day);

  return (
    <>
      <PageTitle
        title="Operator Applications"
        description={
          <>
            Applications from <Link href="/apply/operator" target="_blank" className="font-semibold text-brand-700 underline">/apply/operator</Link>.
            Approving never grants access: invite approved applicants as a separate step.
          </>
        }
      />

      <ul className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <li key={s}>
            <Link
              href={s === "ALL" ? "/admin/applications" : `/admin/applications?status=${s}`}
              className={`block rounded-lg border px-3 py-2 hover:bg-subtle ${(filters.status || "ALL") === s ? "border-brand-700 bg-brand-50" : "border-line bg-surface"}`}
            >
              <span className="block text-[11px] font-extrabold tracking-wide text-ink-muted uppercase">{s === "ALL" ? "All" : STATUS_LABEL[s]}</span>
              <span className="block text-2xl font-extrabold tabular-nums">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]" role="search">
          <input name="q" defaultValue={filters.q} placeholder="Search name, email, reference or department" aria-label="Search applications" className={inputCls} />
          <select name="status" defaultValue={filters.status} aria-label="Status" className={selectCls}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select name="day" defaultValue={filters.day} aria-label="Available on" className={selectCls}>
            <option value="">Any day</option>
            {DAYS.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className={btn.primary}>Filter</button>
            {filtered && <Link href="/admin/applications" className={btn.secondary}>Clear</Link>}
          </div>
        </form>

        {rows.length === 0 ? (
          <Empty title={filtered ? "No applications match these filters" : "No applications yet"}>
            {!filtered && "Share /apply/operator with students who would like to become match operators."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/applications/${a.id}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3 hover:bg-subtle">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold break-words">{a.full_name}</span>
                    <span className="block text-sm break-all text-ink-muted">{a.email}{a.department ? ` · ${a.department}` : ""}{a.level ? ` ${a.level}` : ""}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {a.available_days.map((d) => (
                        <span key={d} className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-bold">{dayLabel(d).slice(0, 3)}</span>
                      ))}
                      {a.periods.map((p) => (
                        <span key={p} className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">{periodLabel(p)}</span>
                      ))}
                      {!a.can_attend && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">Can’t attend in person</span>}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    <span className="text-xs text-ink-faint">{a.reference} · {formatWatDateTime(a.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
