import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { WhatsAppLogo, WHATSAPP_GREEN } from "@/components/ui/brand-icons";
import { notFound } from "next/navigation";
import crest from "../../../../../../public/brand/eksu-crest-192.png";
import { Confetti } from "@/components/team/Confetti";
import { TeamCrest } from "@/components/team/TeamCrest";
import { getSquad, getTeam } from "@/lib/data";
import { siteOrigin, welcomePath } from "@/lib/site-url";

/*
 * Shareable welcome page for a team: /teams/<team id>/welcome.
 * Built from the live team record (no copies), so it exists for every team the
 * moment an admin creates it. It celebrates the team joining EKSU Sports Hub;
 * it deliberately says nothing about registration or payment status.
 */

export async function generateMetadata({ params }: PageProps<"/teams/[id]/welcome">): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) return { title: "Team" };
  const url = `${await siteOrigin()}${welcomePath(id)}`;
  const title = `${team.name} is on EKSU Sports Hub`;
  const description = `Welcome, ${team.name}! Follow the team's fixtures, live scores, results and squad on EKSU Sports Hub.`;
  return {
    title: `Welcome, ${team.name}`,
    description,
    openGraph: { type: "website", url, title, description, siteName: "EKSU Sports Hub" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TeamWelcomePage({ params }: PageProps<"/teams/[id]/welcome">) {
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) notFound();
  const squad = await getSquad(id).catch(() => []);
  const origin = await siteOrigin();
  const shareText = `${team.name} is now on EKSU Sports Hub! Follow our fixtures, live scores and squad: ${origin}/teams/${id}`;

  return (
    <div className="relative -mx-3 overflow-hidden px-3 pt-4 pb-6 sm:mx-0 sm:px-0">
      <Confetti />
      <section className="relative mx-auto max-w-md overflow-hidden rounded-3xl border border-line bg-surface text-center shadow-[0_12px_40px_-12px_rgb(0_0_0/0.18)]">
        <div
          className="h-1.5"
          style={{ background: `linear-gradient(90deg, ${team.colors.primary}, #761530, #f5b700)` }}
          aria-hidden="true"
        />

        <div className="flex items-center justify-center gap-2 pt-5">
          <Image src={crest} alt="" width={28} height={28} />
          <span className="font-display text-sm font-extrabold tracking-[0.08em] uppercase">
            EKSU <span className="text-brand-fg">Sports Hub</span>
          </span>
        </div>

        <div className="relative mx-auto mt-6 grid size-44 place-items-center">
          <span
            className="absolute inset-0 rounded-full motion-safe:animate-[wl-glow_2.4s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(circle, ${team.colors.primary}33 0%, transparent 70%)` }}
            aria-hidden="true"
          />
          <span className="relative motion-safe:animate-[wl-pop_.8s_cubic-bezier(.2,.9,.3,1.3)_.15s_both]">
            <TeamCrest team={team} size="hero" />
          </span>
        </div>

        <div className="px-6 pb-7">
          <p className="mt-4 text-xs font-bold tracking-[0.18em] text-brand-fg uppercase motion-safe:animate-[onb-up_.6s_.35s_ease-out_both]">
            Congratulations
          </p>
          <h1 className="mt-1 font-display text-[34px] leading-[1.05] font-extrabold tracking-[0.01em] uppercase motion-safe:animate-[onb-up_.6s_.45s_ease-out_both]">
            {team.name}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted motion-safe:animate-[onb-up_.6s_.55s_ease-out_both]">
            Welcome to <strong className="text-ink">EKSU Sports Hub</strong>. Your team now has its own page for fixtures, live scores,
            results and squad, all in one place.
          </p>

          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-xs font-semibold text-ink-muted">
            {squad.length > 0 ? `${squad.length} player${squad.length === 1 ? "" : "s"} on the squad` : "Squad details coming soon"}
          </p>

          <Link
            href={`/teams/${id}`}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 text-[15px] font-bold tracking-[0.1em] text-white uppercase shadow-sm transition-colors hover:bg-brand-600"
          >
            View your team <span aria-hidden="true">→</span>
          </Link>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line text-sm font-semibold hover:bg-subtle"
          >
            <WhatsAppLogo size={20} style={{ color: WHATSAPP_GREEN }} /> Share with your teammates
          </a>
        </div>
      </section>
      <p className="relative mx-auto mt-4 max-w-md text-center text-xs text-ink-faint">
        This page celebrates your team joining EKSU Sports Hub. Registration and payment are confirmed separately by the Sports Directorate.
      </p>
    </div>
  );
}

