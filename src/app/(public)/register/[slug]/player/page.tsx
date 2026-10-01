import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegistrationComingSoon } from "@/components/registration/ComingSoon";
import { RegistrationWizard } from "@/components/registration/RegistrationWizard";
import { publicRegistrationEnabled } from "@/lib/registration/flag";
import { getOpenWindow } from "@/lib/registration/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register as a player" };

export default async function PlayerRegistrationPage({ params }: PageProps<"/register/[slug]/player">) {
  if (!publicRegistrationEnabled()) return <RegistrationComingSoon />;
  const { slug } = await params;
  const w = await getOpenWindow(slug);
  if (!w) redirect("/register");
  if (!w.allow_player) redirect(`/register/${slug}`);
  return <RegistrationWizard mode="PLAYER_SELF" window={w} />;
}
