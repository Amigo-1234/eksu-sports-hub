import Link from "next/link";
import { TeamCrest } from "@/components/team/TeamCrest";
import type { CompetitionDetailView } from "@/lib/types";

/** Honours of a completed competition — derived from results, never typed. */
export function ChampionBanner({ detail }: { detail: CompetitionDetailView }) {
  if (detail.status !== "COMPLETED" || !detail.champion) return null;
  const c = detail.champion;
  return (
    <section aria-label="Champion" className="overflow-hidden rounded-card bg-brand-800 text-white">
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <span className="text-4xl" aria-hidden="true">🏆</span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-widest text-accent-300 uppercase">Champions</p>
          <Link href={`/teams/${c.id}`} className="mt-1 flex min-w-0 items-center gap-2 hover:underline">
            <TeamCrest team={c} size="md" />
            <span className="font-display text-2xl leading-tight font-extrabold break-words sm:text-3xl">{c.name}</span>
          </Link>
        </div>
      </div>
      {(detail.runnerUp || detail.thirdPlace) && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-white/10 bg-black/10 px-4 py-2.5 text-sm sm:px-5">
          {detail.runnerUp && (
            <div className="flex gap-1.5">
              <dt className="text-white/70">Runner-up</dt>
              <dd className="font-bold">{detail.runnerUp.shortName}</dd>
            </div>
          )}
          {detail.thirdPlace && (
            <div className="flex gap-1.5">
              <dt className="text-white/70">Third place</dt>
              <dd className="font-bold">{detail.thirdPlace.shortName}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
