import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpLineupEditor } from "@/components/operator/OpLineupEditor";
import { operatorDataSource } from "@/lib/operator/data";
import { requireOperator } from "@/lib/operator/session";

export const metadata: Metadata = { title: "Line-up" };

export default async function OpLineupPage({ params }: PageProps<"/op/matches/[id]/lineup/[side]">) {
  const { id, side } = await params;
  if (side !== "home" && side !== "away") notFound();
  const { operator, allowed } = await requireOperator();
  if (!allowed || !operator) return null;
  const source = operatorDataSource();
  const seed = await source.getAssignmentSeed(operator, id);
  if (!seed) notFound();
  const team = side === "home" ? seed.match.homeTeam : seed.match.awayTeam;
  const state = await source.getLineupEditorState(id, team.id);

  return (
    <div className="pt-3">
      <Link href={`/op/matches/${id}`} className="inline-flex h-11 items-center text-sm font-bold text-ink-muted">
        ← Match prep
      </Link>
      <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight uppercase">{team.shortName} line-up</h1>
      <p className="mb-4 text-sm text-ink-muted">
        {seed.match.homeTeam.shortName} v {seed.match.awayTeam.shortName} · only screened, eligible squad players are listed.
      </p>
      {state ? (
        <OpLineupEditor initial={state} backHref={`/op/matches/${id}`} />
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-line-strong p-4 text-center text-sm font-semibold text-ink-muted">
          Line-ups are not available in the demo. They need the live backend with real squads.
        </p>
      )}
    </div>
  );
}
