import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineupBuilder } from "@/components/lineup/LineupBuilder";
import { btn, Card, PageTitle, StatusBadge } from "@/components/admin/ui";
import { confirmLineup, correctLineup, reopenLineup, saveLineup } from "@/lib/admin/actions/lineups";
import { getMatchRow } from "@/lib/admin/data/matches";
import { getLineupEditorState } from "@/lib/admin/data/players";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Line-up" };

/** Match → team → eligible squad → XI, bench, formation, captain → draft → confirm. */
export default async function AdminLineupPage({ params }: PageProps<"/admin/matches/[id]/lineup/[side]">) {
  const { id, side } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (side !== "home" && side !== "away")) notFound();
  const row = await getMatchRow(id);
  if (!row) notFound();
  const teamId = side === "home" ? row.home_team_id : row.away_team_id;
  const state = await getLineupEditorState(id, teamId);
  if (!state) notFound();
  const other = side === "home" ? "away" : "home";
  const started = row.status !== "SCHEDULED";

  return (
    <>
      <PageTitle
        title={`${state.team.name} line-up`}
        back={{ href: `/admin/matches/${id}#lineups`, label: `${row.home.short_name} v ${row.away.short_name}` }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={row.status} />
            {row.competition.name} · {formatWatDateTime(row.scheduled_at)} WAT
          </span>
        }
        actions={
          <Link href={`/admin/matches/${id}/lineup/${other}`} className={btn.secondary}>
            {other === "home" ? row.home.short_name : row.away.short_name} line-up →
          </Link>
        }
      />
      {state.match.lineup_override && !started && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
          Kick-off override active: {state.match.lineup_override}
        </p>
      )}
      <Card>
        <LineupBuilder
          initial={state}
          actions={{
            save: saveLineup.bind(null, id, teamId),
            confirm: confirmLineup.bind(null, id, teamId),
            reopen: reopenLineup.bind(null, id, teamId),
            ...(started ? { correct: correctLineup.bind(null, id, teamId) } : {}),
          }}
        />
      </Card>
    </>
  );
}
