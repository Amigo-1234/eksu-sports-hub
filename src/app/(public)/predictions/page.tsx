import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrophyIcon } from "@/components/ui/icons";
import { DATA_SOURCE_KIND } from "@/lib/data";
import type { Leaderboard } from "@/lib/fan/types";
import { deviceToken } from "@/lib/notifications/server";
import { serviceClient } from "@/lib/registration/server";

export const metadata: Metadata = {
  title: "Prediction league",
  description: "Predict EKSU match scores, earn points and climb the leaderboard.",
};

const PERIODS = [
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
] as const;

const MEDAL = ["bg-accent-400 text-ink", "bg-[#c0c4cc] text-ink", "bg-[#d39a6a] text-ink"];

async function board(period: "week" | "all"): Promise<Leaderboard | null> {
  const db = DATA_SOURCE_KIND === "live" ? serviceClient() : null;
  if (!db) return null;
  const { data, error } = await db.rpc("service_fan_leaderboard", { p_period: period, p_token: await deviceToken(), p_limit: 100 });
  return error ? null : (data as Leaderboard);
}

/** Prediction league: points from score predictions on finished matches. */
export default async function PredictionsPage({ searchParams }: PageProps<"/predictions">) {
  const p = (await searchParams).period;
  const period = p === "all" ? "all" : "week";
  const data = await board(period);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Prediction league" subtitle="Predict the score before kick-off: 3 points for the exact score, 1 for the right result." />
      <div role="group" aria-label="Period" className="mb-3 flex gap-1.5">
        {PERIODS.map((x) => (
          <Link
            key={x.id}
            href={`/predictions?period=${x.id}`}
            aria-current={x.id === period ? "page" : undefined}
            className={`flex h-9 items-center rounded-full px-4 text-[13px] font-bold ${
              x.id === period ? "bg-ink text-canvas" : "border border-line bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {!data ? (
        <EmptyState icon={<TrophyIcon size={18} />} title="Leaderboard not available" description="Try again in a moment." />
      ) : (
        <>
          {data.me && (
            <div className="mb-3 flex items-center gap-3 rounded-card border border-brand-300 bg-brand-50 px-4 py-3">
              <span className="font-display text-3xl font-extrabold text-brand-fg tabular-nums">#{data.me.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">You · {data.me.name}</p>
                <p className="text-xs text-ink-muted">
                  {data.me.played} {data.me.played === 1 ? "match" : "matches"} · {data.me.exact} exact
                </p>
              </div>
              <span className="font-display text-2xl font-extrabold tabular-nums">{data.me.points} pts</span>
            </div>
          )}
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<TrophyIcon size={18} />}
              title={period === "week" ? "No points yet this week" : "No points yet"}
              description="Points appear once matches you predicted finish. Open an upcoming match, tap Fans and predict the score."
              action={{ href: "/fixtures", label: "Upcoming fixtures" }}
            />
          ) : (
            <ol className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-label="Leaderboard">
              {data.rows.map((r) => (
                <li key={`${r.rank}-${r.name}`} className={`flex items-center gap-3 px-4 py-2.5 ${r.me ? "bg-brand-50" : ""}`}>
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold tabular-nums ${
                      MEDAL[r.rank - 1] ?? "text-ink-muted"
                    }`}
                  >
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {r.name}
                      {r.me && <span className="ml-1.5 rounded bg-brand-700 px-1 text-[10px] font-bold text-white uppercase">You</span>}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {r.played} played · {r.exact} exact
                    </span>
                  </span>
                  <span className="font-display text-xl font-extrabold tabular-nums">{r.points}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 px-1 text-xs text-ink-faint">
            {data.players} {data.players === 1 ? "player" : "players"}. Ties are split by exact scores. Weeks start on Monday (WAT). Only finished matches count.
          </p>
        </>
      )}
    </div>
  );
}
