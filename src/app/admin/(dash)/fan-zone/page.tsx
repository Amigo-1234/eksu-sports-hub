import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { btn, Card, Empty, inputCls, PageTitle } from "@/components/admin/ui";
import { moderateFanComment } from "@/lib/admin/actions/fan-zone";
import { listFanComments, type FanFilter } from "@/lib/admin/data/fan-zone";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Fan Zone" };

const FILTERS: { id: FanFilter; label: string }[] = [
  { id: "reported", label: "Reported" },
  { id: "hidden", label: "Hidden" },
  { id: "all", label: "All comments" },
];

const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : undefined);

/** Moderation for match and news banter. Three fan reports hide a comment automatically. */
export default async function FanZoneAdmin({ searchParams }: PageProps<"/admin/fan-zone">) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.id === sp.filter)?.id ?? "reported") as FanFilter;
  const q = one(sp.q);
  const rows = await listFanComments(filter, q);

  return (
    <>
      <PageTitle
        title="Fan Zone"
        description="Comments fans leave on matches and news. A comment is hidden automatically after three reports from different devices; you can hide or restore any comment here."
      />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/admin/fan-zone?filter=${f.id}`}
              aria-current={f.id === filter ? "page" : undefined}
              className={f.id === filter ? btn.primary : btn.secondary}
            >
              {f.label}
            </Link>
          ))}
          <form className="ml-auto flex gap-2">
            <input type="hidden" name="filter" value={filter} />
            <input name="q" defaultValue={q} placeholder="Search name or text" aria-label="Search comments" className={inputCls} />
            <button className={btn.secondary}>Search</button>
          </form>
        </div>
        {rows.length === 0 ? (
          <Empty title={filter === "reported" ? "Nothing reported" : "No comments"} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <b>{c.author_name}</b>
                    <span className="ml-2 text-xs text-ink-faint">
                      {formatWatDateTime(c.created_at)} ·{" "}
                      <Link
                        className="underline"
                        href={c.target_kind === "match" ? `/matches/${c.target_id}` : `/news/${c.target_id}`}
                        target="_blank"
                      >
                        {c.target_kind === "match" ? "Match" : "News"}
                      </Link>
                      {c.parent_id && " · reply"}
                    </span>
                  </p>
                  <p className="mt-1 text-[15px] break-words whitespace-pre-line">{c.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {c.report_count} {c.report_count === 1 ? "report" : "reports"}
                    {c.hidden_at && ` · hidden ${formatWatDateTime(c.hidden_at)}${c.hidden_reason ? ` (${c.hidden_reason})` : ""}`}
                  </p>
                </div>
                {c.hidden_at ? (
                  <ConfirmAction
                    action={moderateFanComment}
                    hidden={{ id: c.id, op: "restore" }}
                    trigger="Restore"
                    title="Restore this comment?"
                    body="It will show on the public site again."
                    confirmLabel="Restore"
                    tone="primary"
                  />
                ) : (
                  <ConfirmAction
                    action={moderateFanComment}
                    hidden={{ id: c.id, op: "hide" }}
                    trigger="Hide"
                    title="Hide this comment?"
                    body="It disappears from the public site straight away. You can restore it later."
                    confirmLabel="Hide comment"
                    reason={{ label: "Reason (optional)", placeholder: "e.g. abusive" }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
