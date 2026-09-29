import type { Metadata } from "next";
import Link from "next/link";
import { ScreeningActions, ScreeningBadge } from "@/components/admin/Screening";
import { btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { listScreenings, SCREENING_STATUSES, type ScreeningFilters, type ScreeningStatus } from "@/lib/admin/data/players";
import { listFaculties, listSeasons } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Screening" };

const UUID = /^[0-9a-f-]{36}$/i;
const LABEL: Record<ScreeningStatus, string> = { PENDING: "Pending", CLEARED: "Cleared", REJECTED: "Rejected", SUSPENDED: "Suspended" };

/**
 * The screening queue: every registered player needs a decision per team +
 * season before they can join a squad. Pending players first, oldest first.
 */
export default async function ScreeningPage({ searchParams }: PageProps<"/admin/screening">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const uuid = (k: string) => (UUID.test(str(k)) ? str(k) : undefined);
  const rawStatus = str("status");
  const status = rawStatus === "ALL" ? undefined : SCREENING_STATUSES.includes(rawStatus as ScreeningStatus) ? (rawStatus as ScreeningStatus) : "PENDING";
  const [teams, seasons, faculties, competitions] = await Promise.all([listTeamRefs(), listSeasons(), listFaculties(), listCompetitionOptions()]);
  const season = uuid("season") ?? (str("season") === "all" ? undefined : seasons.find((s) => s.is_current)?.id);
  const filters: ScreeningFilters = {
    status,
    team: uuid("team"),
    season,
    competition: uuid("competition"),
    faculty: uuid("faculty"),
    department: uuid("department"),
    name: str("name") || undefined,
    student: str("student") || undefined,
  };
  const { counts, rows } = await listScreenings(filters);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      status: rawStatus || undefined,
      team: filters.team,
      season: str("season") || undefined,
      competition: filters.competition,
      faculty: filters.faculty,
      department: filters.department,
      name: filters.name,
      student: filters.student,
    };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const departments = faculties.flatMap((f) => f.departments.map((d) => ({ ...d, faculty: f.name })));

  return (
    <>
      <PageTitle
        title="Screening"
        description="Players must be screened and CLEARED for a team and season before they can join a squad or be picked in a line-up. Student numbers and decisions are private to administrators."
        actions={
          <Link href="/admin/players#register" className={btn.primary}>
            Register player
          </Link>
        }
      />

      <p role="status" className="empty:hidden">
        {str("notice") && (
          <span className="mb-4 block rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">{str("notice").slice(0, 200)}</span>
        )}
      </p>

      <nav aria-label="Screening status" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {[...SCREENING_STATUSES, "ALL" as const].map((s) => {
          const active = s === "ALL" ? !status : status === s;
          const n = s === "ALL" ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) : (counts[s] ?? 0);
          return (
            <Link
              key={s}
              href={`/admin/screening${qs({ status: s === "PENDING" ? undefined : s })}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${
                active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:bg-subtle"
              }`}
            >
              {s === "ALL" ? "All" : LABEL[s]}
              <span className={`rounded px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-subtle"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rawStatus && <input type="hidden" name="status" value={rawStatus} />}
          <Field label="Player name">
            <input name="name" defaultValue={filters.name} className={inputCls} placeholder="Search name" />
          </Field>
          <Field label="Student / matric number">
            <input name="student" defaultValue={filters.student} className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Team">
            <select name="team" defaultValue={filters.team ?? ""} className={selectCls}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Season">
            <select name="season" defaultValue={uuid("season") ?? (str("season") === "all" ? "all" : (season ?? "all"))} className={selectCls}>
              <option value="all">All seasons</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Competition">
            <select name="competition" defaultValue={filters.competition ?? ""} className={selectCls}>
              <option value="">All competitions</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.season}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Faculty">
            <select name="faculty" defaultValue={filters.faculty ?? ""} className={selectCls}>
              <option value="">All faculties</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select name="department" defaultValue={filters.department ?? ""} className={selectCls}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.faculty})
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button className={btn.secondary}>Apply filters</button>
            <Link href="/admin/screening" className={btn.ghost}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card title={`${status ? LABEL[status] : "All"} · ${rows.length}${rows.length >= 200 ? "+" : ""}`}>
        {rows.length === 0 ? (
          <Empty title={status === "PENDING" ? "Nobody is waiting for screening" : "No players match these filters"}>
            {status === "PENDING" && "Newly registered players appear here until they are cleared or rejected."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const scope = `${r.team.short_name} · ${r.season.name}${r.competition ? ` · ${r.competition.name}` : ""}`;
              return (
                <li key={r.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] md:items-start">
                  <div className="min-w-0">
                    <Link href={`/admin/players/${r.player_id}`} className="font-bold text-brand-700 hover:underline">
                      {r.name ?? "Unnamed player"}
                    </Link>
                    <p className="font-mono text-xs break-all text-ink-muted">{r.student_id ?? "No student number"}</p>
                    <p className="text-xs text-ink-muted">{[r.department, r.faculty].filter(Boolean).join(" · ") || "Faculty not recorded"}</p>
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <ScreeningBadge status={r.status} />
                      <span className="font-semibold">{scope}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {r.decided_at
                        ? `Decided ${formatWatDateTime(r.decided_at)}${r.decided_by ? ` by ${r.decided_by}` : ""}`
                        : `Registered ${formatWatDateTime(r.created_at)}`}
                      {r.screened_on ? ` · screened ${r.screened_on}` : ""}
                    </p>
                    {r.reason && <p className="mt-0.5 text-xs break-words">Reason: {r.reason}</p>}
                  </div>
                  <div className="flex flex-wrap items-start gap-2 md:justify-end">
                    <ScreeningActions id={r.id} status={r.status} player={r.name ?? "this player"} scope={scope} returnTo={`/admin/screening${qs({})}`} />
                    <Link href={`/admin/players/${r.player_id}`} className={btn.small}>
                      Review
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
