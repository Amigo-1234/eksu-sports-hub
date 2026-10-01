import Link from "next/link";
import { ShirtIcon } from "@/components/ui/icons";

/** Shown on every public registration page while PUBLIC_REGISTRATION_ENABLED is off. */
export function RegistrationComingSoon() {
  return (
    <div className="mx-auto max-w-xl py-6 sm:py-10">
      <section aria-labelledby="coming-soon-title" className="overflow-hidden rounded-card border border-line bg-surface text-center">
        <div className="h-1.5 bg-brand-700" aria-hidden="true">
          <div className="h-full w-1/3 bg-accent-500" />
        </div>
        <div className="px-5 py-8 sm:px-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700">
            <ShirtIcon size={26} />
          </div>
          <p className="mt-4 text-xs font-bold tracking-[0.18em] text-brand-700 uppercase">Player registration</p>
          <h1 id="coming-soon-title" className="mt-1 font-display text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
            Coming soon
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-ink">Player and team registration will be available here soon.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            For the current competition period, player and team registrations are being handled directly by the EKSU Sports Directorate and
            authorized competition administrators.
          </p>
          <p className="mx-auto mt-4 max-w-md rounded-lg bg-subtle px-4 py-3 text-sm">
            If you need to register for an active competition, contact your team official or the Sports Directorate.
          </p>
          <div className="mt-6 grid gap-2 sm:flex sm:justify-center">
            <Link
              href="/register/status"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800"
            >
              Check registration status
            </Link>
            <Link
              href="/competitions"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-5 text-sm font-bold hover:bg-subtle"
            >
              Back to competitions
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-muted">Already given a registration reference? You can check its status with the phone number on the registration.</p>
        </div>
      </section>
    </div>
  );
}
