import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistrationWizard } from "@/components/registration/RegistrationWizard";
import { getOpenWindow } from "@/lib/registration/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register a team" };

export default async function TeamRegistrationPage({ params }: PageProps<"/register/[slug]/team">) {
  const w = await getOpenWindow((await params).slug);
  if (!w || !w.allow_team) notFound();
  return <RegistrationWizard mode="TEAM_ROSTER" window={w} />;
}
