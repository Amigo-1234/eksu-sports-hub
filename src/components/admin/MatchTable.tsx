import Link from "next/link";
import type { MatchRow } from "@/lib/admin/types";
import { formatWatDateTime } from "@/lib/admin/time";
import { Badge, StatusBadge, TableWrap, td, th } from "./ui";

export function OperatorCell({ m }: { m: MatchRow }) {
  const primary = m.assignments.find((a) => a.role === "PRIMARY");
  const backup = m.assignments.find((a) => a.role === "BACKUP");
  if (!primary) {
    const needs = m.status === "SCHEDULED" || m.status === "1H" || m.status === "HT" || m.status === "2H";
    return needs ? <Badge tone="bad">No primary</Badge> : <span className="text-ink-faint">—</span>;
  }
  return (
    <span className="block min-w-0 text-sm">
      <span className="block truncate font-semibold">{primary.display_name}</span>
      {backup && <span className="block truncate text-xs text-ink-muted">Backup: {backup.display_name}</span>}
    </span>
  );
}

const showScore = (m: MatchRow) => m.status !== "SCHEDULED" && m.status !== "POSTPONED" && m.status !== "CANCELLED";

/** Fixture list: table on wide screens, stacked cards on phones. */
export function MatchTable({ rows }: { rows: MatchRow[] }) {
  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((m) => (
          <li key={m.id}>
            <Link href={`/admin/matches/${m.id}`} className="block py-3 hover:bg-subtle">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-muted">{formatWatDateTime(m.scheduled_at)}</span>
                <StatusBadge status={m.status} />
              </div>
              <p className="mt-1 font-bold break-words">
                {m.home.short_name} {showScore(m) ? `${m.home_score}–${m.away_score}` : "v"} {m.away.short_name}
              </p>
              <p className="text-xs break-words text-ink-muted">
                {m.competition.short_name}
                {m.round_label ? ` · ${m.round_label}` : ""}
                {m.venue ? ` · ${m.venue.short_name}` : ""}
              </p>
              <div className="mt-1.5">
                <OperatorCell m={m} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <TableWrap label="Fixtures">
          <table className="w-full min-w-[46rem]">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Kick-off (WAT)</th>
                <th className={th}>Match</th>
                <th className={th}>Competition</th>
                <th className={th}>Venue</th>
                <th className={th}>Status</th>
                <th className={th}>Operators</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-subtle">
                  <td className={`${td} whitespace-nowrap`}>{formatWatDateTime(m.scheduled_at)}</td>
                  <td className={td}>
                    <Link href={`/admin/matches/${m.id}`} className="font-bold text-brand-700 hover:underline">
                      {m.home.short_name} {showScore(m) ? `${m.home_score}–${m.away_score}` : "v"} {m.away.short_name}
                    </Link>
                  </td>
                  <td className={td}>
                    {m.competition.short_name}
                    {m.round_label && <span className="block text-xs text-ink-muted">{m.round_label}</span>}
                  </td>
                  <td className={td}>{m.venue?.short_name ?? <span className="text-ink-faint">TBC</span>}</td>
                  <td className={td}>
                    <StatusBadge status={m.status} />
                  </td>
                  <td className={`${td} max-w-48`}>
                    <OperatorCell m={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
