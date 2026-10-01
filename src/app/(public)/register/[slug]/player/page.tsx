import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistrationWizard } from "@/components/registration/RegistrationWizard";
import { getOpenWindow } from "@/lib/registration/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register as a player" };

export default async function PlayerRegistrationPage({ params }: PageProps<"/register/[slug]/player">) {
  const w = await getOpenWindow((await params).slug);
  if (!w || !w.allow_player) notFound();
  return <RegistrationWizard mode="PLAYER_SELF" window={w} />;
}
