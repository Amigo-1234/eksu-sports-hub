import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegistrationComingSoon } from "@/components/registration/ComingSoon";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatWatDateTime } from "@/lib/admin/time";
import { publicRegistrationEnabled } from "@/lib/registration/flag";
import { getOpenWindow } from "@/lib/registration/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/register/[slug]">): Promise<Metadata> {
  if (!publicRegistrationEnabled()) return { title: "Registration · Coming soon" };
  const w = await getOpenWindow((await params).slug);
  return { title: w ? `Register · ${w.competition.short_name}` : "Register" };
}

export default async function WindowPage({ params }: PageProps<"/register/[slug]">) {
  // Old/shared links never 404: Coming soon while public registration is off,
  // back to the list when this window is not (or no longer) open.
  if (!publicRegistrationEnabled()) return <RegistrationComingSoon />;
  const w = await getOpenWindow((await params).slug);
  if (!w) redirect("/register");
  return (
    <>
      <PageHeader title={w.title} subtitle={`${w.competition.name} · ${w.season.name}`} />
      <div className="space-y-4">
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-ink-muted">{w.closes_at ? `Registration closes ${formatWatDateTime(w.closes_at)} (WAT).` : "Registration is open until further notice."}</p>
          {w.instructions && <p className="mt-2 text-sm whitespace-pre-line">{w.instructions}</p>}
          <h2 className="mt-4 text-sm font-bold">You will need</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
            <li>Full name, phone number, matric / student number</li>
            <li>Faculty, department and level</li>
            <li>A clear passport photograph</li>
            <li>Optional: student ID card, course registration form or admission letter (photo or PDF, max 4 MB)</li>
          </ul>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          {w.allow_player && (
            <Link href={`/register/${w.slug}/player`} className="block rounded-card border-2 border-brand-700 bg-surface p-4 hover:bg-brand-50">
              <span className="font-display text-lg font-extrabold">Register as a player</span>
              <span className="mt-1 block text-sm text-ink-muted">Register yourself for {w.competition.short_name}.</span>
            </Link>
          )}
          {w.allow_team && (
            <Link href={`/register/${w.slug}/team`} className="block rounded-card border border-line-strong bg-surface p-4 hover:bg-subtle">
              <span className="font-display text-lg font-extrabold">Register a team / roster</span>
              <span className="mt-1 block text-sm text-ink-muted">Captains and managers: send your whole roster under one reference.</span>
            </Link>
          )}
        </div>
        <p className="rounded-card border border-accent-300 bg-accent-100 px-4 py-3 text-sm">
          Your registration does not mean you have been cleared to participate. The Sports Directorate must screen and approve your registration.
        </p>
      </div>
    </>
  );
}
