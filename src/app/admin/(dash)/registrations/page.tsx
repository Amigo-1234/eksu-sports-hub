import type { Metadata } from "next";
import Link from "next/link";
import { RegistrationBadge } from "@/components/admin/Registration";
import { Badge, btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { listRegistrations, listRegistrationWindows, type RegistrationFilters } from "@/lib/admin/data/registrations";
import { listFaculties, listSeasons } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";
import { formatWatDateTime } from "@/lib/admin/time";
import { REGISTRATION_STATUSES, STATUS_LABEL, type RegistrationStatus, type RegistrationType } from "@/lib/registration/rules";

export const metadata: Metadata = { title: "Registrations" };

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The registration inbox. A registration is a request: accepting it opens a
 * PENDING screening, never eligibility. Matric numbers, phones and documents
 * are visible to administrators only.
 */
export default async function RegistrationsPage({ searchParams }: PageProps<"/admin/registrations">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const uuid = (k: string) => (UUID.test(str(k)) ? str(k) : undefined);
  const rawStatus = str("status");
  const status = REGISTRATION_STATUSES.includes(rawStatus as RegistrationStatus) ? (rawStatus as RegistrationStatus) : undefined;
  const filters: RegistrationFilters = {
    window: uuid("window"),
    competition: uuid("competition"),
    season: uuid("season"),
    team: uuid("team"),
    faculty: uuid("faculty"),
    department: uuid("department"),
    type: ["PLAYER_SELF", "TEAM_ROSTER"].includes(str("type")) ? (str("type") as RegistrationType) : undefined,
    status,
    from: DAY.test(str("from")) ? str("from") : undefined,
    to: DAY.test(str("to")) ? str("to") : undefined,
    search: str("q").slice(0, 60) || undefined,
  };
  const [{ counts, rows }, windows, competitions, seasons, teams, faculties] = await Promise.all([
    listRegistrations(filters),
    listRegistrationWindows(),
    listCompetitionOptions(),
    listSeasons(),
    listTeamRefs(),
    listFaculties(),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = { ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k === "search" ? "q" : k, v])) };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const departments = faculties.flatMap((f) => f.departments.map((d) => ({ ...d, faculty: f.name })));
  const openWindows = windows.filter((w) => w.open_now);

  return (
    <>
      <PageTitle
        title="Registrations"
        description="Player and team registrations from the public form. Review, request corrections, reject, or accept for screening — acceptance opens a PENDING screening and never clears anyone."
        actions={
          <Link href="/admin/registrations/windows" className={btn.secondary}>
            Registration windows
          </Link>
        }
      />

      {openWindows.length === 0 && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
          No registration window is accepting submissions right now.{" "}
          <Link href="/admin/registrations/windows" className="underline">
            Manage windows
          </Link>
        </p>
      )}

      <nav aria-label="Registration status" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {[undefined, ...REGISTRATION_STATUSES].map((s) => {
          const active = s === status;
          const n = s ? (counts[s] ?? 0) : total;
          return (
            <Link
              key={s ?? "all"}
              href={`/admin/registrations${qs({ status: s })}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${
                active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:bg-subtle"
              }`}
            >
              {s ? STATUS_LABEL[s] : "All"}
              <span className={`rounded px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-subtle"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {status && <input type="hidden" name="status" value={status} />}
          <Field label="Search" hint="Reference, name, matric number or phone" className="sm:col-span-2">
            <input name="q" defaultValue={filters.search} className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Window">
            <select name="window" defaultValue={filters.window ?? ""} className={selectCls}>
              <option value="">All windows</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={filters.type ?? ""} className={selectCls}>
              <option value="">Players and teams</option>
              <option value="PLAYER_SELF">Individual players</option>
              <option value="TEAM_ROSTER">Team rosters</option>
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
          <Field label="Season">
            <select name="season" defaultValue={filters.season ?? ""} className={selectCls}>
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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
          <Field label="Submitted from">
            <input type="date" name="from" defaultValue={filters.from} className={inputCls} />
          </Field>
          <Field label="Submitted to">
            <input type="date" name="to" defaultValue={filters.to} className={inputCls} />
          </Field>
          <div className="flex items-end gap-2">
            <button className={btn.secondary}>Apply filters</button>
            <Link href="/admin/registrations" className={btn.ghost}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card title={`${status ? STATUS_LABEL[status] : "All"} · ${rows.length}${rows.length >= 200 ? "+" : ""}`}>
        {rows.length === 0 ? (
          <Empty title="No registrations match">Submissions from the public registration form appear here.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] md:items-center">
                <div className="min-w-0">
                  <Link href={`/admin/registrations/${r.id}`} className="font-mono text-sm font-bold text-brand-700 hover:underline">
                    {r.reference}
                  </Link>
                  <p className="truncate text-sm font-semibold">
                    {r.type === "TEAM_ROSTER" ? `Team roster · ${r.players} player${r.players === 1 ? "" : "s"}` : (r.first_player ?? r.submitter)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {r.type === "TEAM_ROSTER" ? `Sent by ${r.submitter} · ` : ""}
                    {r.submitter_phone}
                  </p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <RegistrationBadge status={r.status} />
                    {r.flags > 0 && <Badge tone="warn">{r.flags} possible duplicate{r.flags > 1 ? "s" : ""}</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {r.competition.short_name} · {r.season}
                    {r.team ? ` · ${r.team.short_name}` : ""} · submitted {formatWatDateTime(r.submitted_at)}
                  </p>
                </div>
                <div className="md:text-right">
                  <Link href={`/admin/registrations/${r.id}`} className={btn.small}>
                    Review
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
