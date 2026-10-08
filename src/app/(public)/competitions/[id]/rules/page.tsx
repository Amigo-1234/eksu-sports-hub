import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompetition } from "@/lib/data";
import { formatDuration } from "@/lib/operator/clock";
import { ruleFacts } from "@/lib/rules/special";

export async function generateMetadata({ params }: PageProps<"/competitions/[id]/rules">): Promise<Metadata> {
  const c = await getCompetition((await params).id);
  return { title: c ? `${c.shortName} rules & regulations` : "Rules & regulations" };
}

/** Official Rules & Regulations of a competition with special rules (players and spectators). */
export default async function CompetitionRules({ params }: PageProps<"/competitions/[id]/rules">) {
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition?.regulations) notFound();
  const { title, summary, items } = competition.regulations;
  const facts = [
    ...(competition.halfSeconds ? [`2 × ${formatDuration(competition.halfSeconds)}`] : []),
    ...ruleFacts(competition.specialRules),
  ];

  return (
    <article aria-labelledby="rules-title" className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-4">
        <h2 id="rules-title" className="font-display text-xl font-extrabold tracking-tight uppercase">{title}</h2>
        {summary && <p className="mt-1 text-sm text-ink-muted">{summary}</p>}
        {facts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Key rules">
            {facts.map((f) => (
              <li key={f} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{f}</li>
            ))}
          </ul>
        )}
      </header>
      <ol className="divide-y divide-line rounded-card border border-line bg-surface">
        {items.map((r, i) => (
          <li key={r.title} className="flex gap-3 px-4 py-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-white tabular-nums" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h3 className="font-bold">{r.title}</h3>
              <p className="mt-0.5 text-sm text-ink-muted">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="px-1 text-xs text-ink-faint">The referee&apos;s decisions are final.</p>
    </article>
  );
}
