import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegistrationComingSoon } from "@/components/registration/ComingSoon";
import { RegistrationWizard } from "@/components/registration/RegistrationWizard";
import { publicRegistrationEnabled } from "@/lib/registration/flag";
import { getOpenWindow } from "@/lib/registration/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register a team" };

export default async function TeamRegistrationPage({ params }: PageProps<"/register/[slug]/team">) {
  if (!publicRegistrationEnabled()) return <RegistrationComingSoon />;
  const { slug } = await params;
  const w = await getOpenWindow(slug);
  if (!w) redirect("/register");
  if (!w.allow_team) redirect(`/register/${slug}`);
  return <RegistrationWizard mode="TEAM_ROSTER" window={w} />;
}
