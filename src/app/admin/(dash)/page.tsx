import type { Metadata } from "next";
import Link from "next/link";
import { LiveMatchCard } from "@/components/admin/LiveMatchCard";
import { MatchTable } from "@/components/admin/MatchTable";
import { Badge, btn, Card, Empty, PageTitle } from "@/components/admin/ui";
import { getDashboard } from "@/lib/admin/data/dashboard";
import { serverNow } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, href, alert }: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <Link href={href} className={`block rounded-card border bg-surface p-4 hover:border-brand-300 ${alert && value > 0 ? "border-loss/50" : "border-line"}`}>
      <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className={`mt-1 font-display text-4xl leading-none font-extrabold tabular-nums ${alert && value > 0 ? "text-loss" : ""}`}>{value}</p>
    </Link>
  );
}

export default async function AdminDashboard() {
  const d = await getDashboard();
  const now = serverNow();
  const c = d.counts;
  return (
    <>
      <PageTitle
        title="Dashboard"
        description="Today's operations at a glance. All times are campus time (WAT)."
        actions={
          <>
            <Link href="/admin/matches/new" className={btn.primary}>
              New fixture
            </Link>
            <Link href="/admin/assignments" className={btn.secondary}>
              Assign operators
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Live now" value={c.live} href="/admin/live" />
        <Stat label="Today" value={c.today} href="/admin/matches?when=today" />
        <Stat label="Upcoming" value={c.upcoming} href="/admin/matches?status=scheduled" />
        <Stat label="Completed" value={c.completed} href="/admin/matches?status=ft" />
        <Stat label="Active competitions" value={c.activeCompetitions} href="/admin/competitions" />
        <Stat label="Active teams" value={c.teams} href="/admin/teams" />
        <Stat label="Operators" value={c.operators} href="/admin/staff" />
        <Stat label="No primary operator" value={c.withoutOperator} href="/admin/matches?operator=no-primary&status=scheduled" alert />
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Live now" actions={<Link href="/admin/live" className={btn.ghost}>Live monitor →</Link>}>
            {d.live.length === 0 ? (
              <Empty title="No matches are live">Live matches appear here as soon as an operator kicks off.</Empty>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {d.live.map((m) => (
                  <LiveMatchCard key={m.match.id} m={m} now={now} />
                ))}
              </div>
            )}
          </Card>
          <Card title="Today's fixtures" actions={<Link href="/admin/matches?when=today" className={btn.ghost}>All fixtures →</Link>}>
            {d.todayMatches.length === 0 ? <Empty title="No fixtures today" /> : <MatchTable rows={d.todayMatches} />}
          </Card>
        </div>
        <Card title="Needs attention" description="Operational warnings from live data.">
          {d.warnings.length === 0 ? (
            <Empty title="Nothing needs attention" />
          ) : (
            <ul className="space-y-2">
              {d.warnings.map((w, i) => (
                <li key={i}>
                  <Link href={w.href} className="block rounded-lg border border-line p-3 hover:bg-subtle">
                    <div className="flex items-start gap-2">
                      <Badge tone={w.severity === "high" ? "bad" : "warn"}>{w.severity === "high" ? "Urgent" : "Check"}</Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-bold break-words">{w.title}</p>
                        <p className="text-xs text-ink-muted">{w.detail}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
