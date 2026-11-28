import Link from "next/link";
import type { PredictionPrize } from "@/lib/prediction-prizes";

/** "Predict the score and win" banner for a sponsored match. */
export function PredictionPrizeBanner({
  prize,
  href,
  compact = false,
}: {
  prize: PredictionPrize;
  /** When set, the banner links to the match's Fans tab. */
  href?: string;
  compact?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-400 text-2xl" aria-hidden="true">
          🏆
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-extrabold uppercase">Predict the score &amp; win a prize</p>
          <p className="mt-1 text-sm text-white/85">
            Get the <strong className="text-white">exact final score</strong> right in Predict the Score and you go home with a prize.
          </p>
        </div>
      </div>
      {!compact && (
        <ul className="mt-3 space-y-1 text-[13px] text-white/80">
          <li>✅ Free to play: no payment, no betting.</li>
          <li>⏱️ Predictions lock at kick-off.</li>
          <li>🚫 No room for cheating: one entry per person. Duplicate or fake accounts are disqualified.</li>
          <li>📞 Leave a contact when you sign in so we can reach you if you win.</li>
        </ul>
      )}
      <p className="mt-3 text-[11px] font-bold tracking-[0.14em] text-accent-400 uppercase">Proudly sponsored by {prize.sponsor}</p>
    </>
  );
  const cls =
    "relative block overflow-hidden rounded-card bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-4 text-white shadow-md ring-1 ring-accent-400/40";
  return href ? (
    <Link href={href} className={`${cls} hover:ring-accent-400`} aria-label={`Predict the score and win a prize, sponsored by ${prize.sponsor}`}>
      {body}
      <span className="mt-3 inline-block rounded-full bg-accent-400 px-4 py-1.5 text-sm font-bold text-brand-900">Predict now</span>
    </Link>
  ) : (
    <section aria-label={`Prediction prize, sponsored by ${prize.sponsor}`} className={cls}>
      {body}
    </section>
  );
}
