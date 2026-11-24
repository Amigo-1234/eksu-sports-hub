import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Application received", robots: { index: false } };

export default async function ApplicationSubmittedPage({ searchParams }: PageProps<"/apply/operator/submitted">) {
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" && /^OPA-[0-9A-F]{6}$/.test(sp.ref) ? sp.ref : null;
  const practice = typeof sp.practice === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(sp.practice) ? sp.practice : null;
  return (
    <div className="mx-auto max-w-xl pt-8 pb-10 text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-win/12 text-win motion-safe:animate-[onb-pop_.5s_ease-out_both]" aria-hidden="true">
        <CheckIcon size={40} />
      </span>
      <h1 className="mt-5 font-display text-[34px] leading-none font-extrabold tracking-[0.01em] uppercase">Application received</h1>
      <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-ink-muted">
        Thank you for applying to become an EKSU Sports Hub match operator. The team will review your application and contact you by email.
      </p>
      {ref && (
        <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
          <p className="text-xs font-bold tracking-[0.1em] text-ink-faint uppercase">Your reference</p>
          <p className="mt-1 font-display text-[30px] leading-none font-extrabold tracking-[0.06em] select-all">{ref}</p>
          <p className="mt-2 text-xs text-ink-muted">Keep it in case you need to contact us about your application.</p>
        </div>
      )}
      {practice && (
        <div className="mx-auto mt-6 max-w-md rounded-2xl border-[3px] border-brand-600 bg-surface px-5 py-5 text-left shadow-card">
          <p className="text-xs font-bold tracking-[0.1em] text-brand-fg uppercase">Next step: your skills test</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            Run a short <b className="text-ink">practice match</b> in the operator console (about 12 minutes). Your score is sent to the team with your
            application. You can start now or later from the same link; it works for 14 days.
          </p>
          <Link
            href={`/practice/${practice}`}
            className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-brand-700 px-6 font-bold text-white hover:bg-brand-800"
          >
            Start the practice test
          </Link>
          <p className="mt-2 text-xs text-ink-faint">Bookmark the practice page or keep this tab open if you want to take it later.</p>
        </div>
      )}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link href="/" className="inline-flex h-12 items-center rounded-2xl bg-brand-700 px-6 font-bold text-white hover:bg-brand-800">
          Back to live scores
        </Link>
        <Link href="/news" className="inline-flex h-12 items-center rounded-2xl border border-line-strong px-6 font-bold hover:bg-subtle">
          Read Sports News
        </Link>
      </div>
    </div>
  );
}
