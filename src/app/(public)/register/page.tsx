import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShirtIcon } from "@/components/ui/icons";
import { formatWatDateTime } from "@/lib/admin/time";
import { RegistrationComingSoon } from "@/components/registration/ComingSoon";
import { publicRegistrationEnabled } from "@/lib/registration/flag";
import { getOpenWindows } from "@/lib/registration/public";

export const metadata: Metadata = { title: "Register", description: "Register as a player or register your team for EKSU competitions." };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!publicRegistrationEnabled()) return <RegistrationComingSoon />;
  const windows = await getOpenWindows();
  return (
    <>
      <PageHeader title="Register" subtitle="Player and team registration for EKSU competitions" />
      <div className="space-y-4">
        <p className="rounded-card border border-accent-300 bg-accent-100 px-4 py-3 text-sm text-ink">
          Registering does <strong>not</strong> make you eligible to play. The Sports Directorate reviews every registration and screens each player before
          they can be named in a squad.
        </p>
        {windows.length === 0 ? (
          <EmptyState icon={<ShirtIcon size={22} />} title="Registration is closed" description="No competition is taking registrations right now. Check back soon." />
        ) : (
          <ul className="space-y-3">
            {windows.map((w) => (
              <li key={w.id} className="rounded-card border border-line bg-surface p-4">
                <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">
                  {w.competition.short_name} · {w.season.name}
                </p>
                <h2 className="mt-0.5 font-display text-xl leading-tight font-extrabold">
                  <Link href={`/register/${w.slug}`} className="hover:underline">
                    {w.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-ink-muted">{w.closes_at ? `Closes ${formatWatDateTime(w.closes_at)} (WAT)` : "Open until further notice"}</p>
                <div className="mt-3 grid gap-2 sm:flex">
                  {w.allow_player && (
                    <Link href={`/register/${w.slug}/player`} className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800">
                      Register as a player
                    </Link>
                  )}
                  {w.allow_team && (
                    <Link
                      href={`/register/${w.slug}/team`}
                      className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong bg-surface px-5 text-sm font-bold text-ink hover:bg-subtle"
                    >
                      Register a team / roster
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm">
          Already registered?{" "}
          <Link href="/register/status" className="font-bold text-brand-700 underline-offset-2 hover:underline">
            Check your registration status
          </Link>
        </p>
      </div>
    </>
  );
}
