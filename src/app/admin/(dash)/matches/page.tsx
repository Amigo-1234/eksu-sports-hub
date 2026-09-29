import type { Metadata } from "next";
import Link from "next/link";
import { MatchTable } from "@/components/admin/MatchTable";
import { btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { listMatches } from "@/lib/admin/data/matches";
import { listVenues } from "@/lib/admin/data/reference";
import { listAssignableOperators } from "@/lib/admin/data/staff";
import { listTeamRefs } from "@/lib/admin/data/teams";
import { dateKey } from "@/lib/format";
import { serverNow } from "@/lib/admin/time";
import type { MatchFilters } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Fixtures / Matches" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function MatchesPage({ searchParams }: PageProps<"/admin/matches">) {
  const sp = await searchParams;
  const today = dateKey(serverNow());
  const when = one(sp.when);
  const f: MatchFilters = {
    date: when === "today" ? today : one(sp.date),
    from: when === "upcoming" ? today : one(sp.from),
    to: one(sp.to),
    competition: one(sp.competition),
    status: one(sp.status),
    team: one(sp.team),
    venue: one(sp.venue),
    operator: one(sp.operator),
  };
  const [{ rows, truncated }, competitions, teams, venues, operators] = await Promise.all([
    listMatches(f),
    listCompetitionOptions(),
    listTeamRefs(),
    listVenues(),
    listAssignableOperators(),
  ]);
  const filtered = Object.values(f).some(Boolean);

  return (
    <>
      <PageTitle
        title="Fixtures / Matches"
        description="All times in campus time (WAT)."
        actions={
          <Link href="/admin/matches/new" className={btn.primary}>
            New fixture
          </Link>
        }
      />
      <Card className="mb-6">
        <nav aria-label="Quick filters" className="mb-3 flex flex-wrap gap-2">
          {[
            ["Today", "?when=today"],
            ["Upcoming", "?when=upcoming&status=scheduled"],
            ["Live", "?status=live"],
            ["No primary operator", "?when=upcoming&status=scheduled&operator=no-primary"],
            ["Postponed", "?status=postponed"],
            ["Results", "?status=ft"],
          ].map(([label, q]) => (
            <Link key={q} href={`/admin/matches${q}`} className={btn.small}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date">
            <input type="date" name="date" defaultValue={f.date} className={inputCls} />
          </Field>
          <Field label="Competition">
            <select name="competition" defaultValue={f.competition ?? ""} className={selectCls}>
              <option value="">All</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={f.status ?? ""} className={selectCls}>
              <option value="">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="live">Live (1H / HT / 2H)</option>
              <option value="ht">Half-time</option>
              <option value="ft">Full-time</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </Field>
          <Field label="Team">
            <select name="team" defaultValue={f.team ?? ""} className={selectCls}>
              <option value="">All</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Venue">
            <select name="venue" defaultValue={f.venue ?? ""} className={selectCls}>
              <option value="">All</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.short_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operator assignment">
            <select name="operator" defaultValue={f.operator ?? ""} className={selectCls}>
              <option value="">Any</option>
              <option value="no-primary">No primary operator</option>
              <option value="none">No operators at all</option>
              {operators.map((o) => (
                <option key={o.user_id} value={o.user_id}>
                  {o.display_name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button className={btn.primary}>Apply filters</button>
            {filtered && (
              <Link href="/admin/matches" className={btn.secondary}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>
      <Card title={`${rows.length}${truncated ? "+" : ""} fixture${rows.length === 1 ? "" : "s"}`} description={truncated ? "Showing the first 200 — narrow the filters to see more." : undefined}>
        {rows.length === 0 ? <Empty title="No fixtures match these filters" /> : <MatchTable rows={rows} />}
      </Card>
    </>
  );
}
