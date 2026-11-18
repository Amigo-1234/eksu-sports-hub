import type { Metadata } from "next";
import Image from "next/image";
import crest from "../../../../../public/brand/eksu-crest-192.png";
import { OperatorApplyForm } from "@/components/apply/OperatorApplyForm";
import { BallIcon, CheckIcon, ClockIcon, LiveIcon, ShirtIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Become a Match Operator",
  description: "Join the EKSU Sports Hub match-day team: record live scores, goals, cards and substitutions for EKSU football matches.",
  openGraph: {
    title: "Become an EKSU Sports Hub Match Operator",
    description: "Help bring EKSU football to life — record live scores and key moments from the touchline. Apply in a few minutes.",
  },
};

const DUTIES = [
  { icon: <LiveIcon size={20} />, title: "Run the live match", text: "Start the clock, record goals, cards and substitutions, half-time and full-time from your phone." },
  { icon: <CheckIcon size={20} />, title: "Get it right", text: "Every update goes straight to fans. Accuracy matters more than speed — mistakes are corrected on the spot." },
  { icon: <ShirtIcon size={20} />, title: "Check line-ups", text: "Confirm both teams' starting XI and substitutes with officials before kick-off." },
  { icon: <ClockIcon size={20} />, title: "2–3 days a week", text: "Pick the days and times that suit your timetable. You are only assigned matches you can attend." },
];

export default function ApplyOperatorPage() {
  return (
    <div className="mx-auto max-w-3xl pt-3 pb-6 sm:pt-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-5 pt-7 pb-8 text-white shadow-card sm:px-8 sm:pt-10 sm:pb-10">
        <Image src={crest} alt="" aria-hidden="true" width={220} height={220} className="pointer-events-none absolute -right-10 -bottom-12 opacity-30 mix-blend-multiply" />
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-[0.08em] uppercase">
          <BallIcon size={13} /> Now recruiting
        </p>
        <h1 className="mt-3 max-w-xl font-display text-[38px] leading-[0.98] font-extrabold tracking-[0.005em] uppercase sm:text-[52px]">
          Become a Match Operator
        </h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-white/90 sm:text-[17px]">
          Be the voice of EKSU football. Operators record every goal, card and substitution live from the touchline, so students, staff and
          fans can follow each match as it happens.
        </p>
        <a
          href="#apply"
          className="mt-6 inline-flex h-13 items-center justify-center rounded-2xl bg-white px-7 text-base font-extrabold text-brand-800 shadow-lg transition-transform hover:-translate-y-0.5"
        >
          Apply now
        </a>
        <p className="mt-3 text-sm text-white/80">Takes about 5 minutes · No account needed</p>
      </section>

      <section aria-labelledby="role" className="mt-6">
        <h2 id="role" className="px-1 font-display text-[24px] leading-tight font-extrabold tracking-[0.01em] uppercase">
          What operators do
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {DUTIES.map((d) => (
            <li key={d.title} className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-fg" aria-hidden="true">
                {d.icon}
              </span>
              <span>
                <span className="block font-bold">{d.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{d.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink-muted shadow-card">
          <p className="font-bold text-ink">How it works</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5">
            <li>Send your application below.</li>
            <li>The Sports Hub team reviews it and may contact you for a short chat.</li>
            <li>Successful applicants get a personal invitation to set up their operator account and a quick training session before their first match.</li>
          </ol>
        </div>
      </section>

      <section id="apply" aria-labelledby="apply-title" className="mt-8 scroll-mt-24">
        <h2 id="apply-title" className="px-1 font-display text-[28px] leading-tight font-extrabold tracking-[0.01em] uppercase">
          Your application
        </h2>
        <p className="mt-1 mb-4 px-1 text-sm text-ink-muted">Fields marked * are required.</p>
        <OperatorApplyForm />
      </section>

      <section aria-labelledby="privacy" className="mt-6 rounded-2xl border border-line bg-subtle px-4 py-3.5 text-[13px] leading-relaxed text-ink-muted">
        <h2 id="privacy" className="font-bold text-ink">How we use your details</h2>
        <p className="mt-1">
          Your answers are stored securely and can only be seen by EKSU Sports Hub administrators. We use them only to review your
          application and contact you about it. Nothing you submit is shown on the public site. Applying does not create an account or give
          access to any match controls.
        </p>
      </section>
    </div>
  );
}
