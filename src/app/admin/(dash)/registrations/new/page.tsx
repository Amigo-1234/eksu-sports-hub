import type { Metadata } from "next";
import Link from "next/link";
import { AdminRegistrationForm } from "@/components/admin/RegistrationIntake";
import { Card, PageTitle } from "@/components/admin/ui";
import { getIntakeOptions } from "@/lib/admin/data/registrations";

export const metadata: Metadata = { title: "New registration" };

/** Admin-led registration: same intake, references, duplicate checks and review as the public form. */
export default async function NewRegistrationPage({ searchParams }: PageProps<"/admin/registrations/new">) {
  const sp = await searchParams;
  const mode = sp.type === "team" ? "TEAM_ROSTER" : "PLAYER_SELF";
  const options = await getIntakeOptions();
  const tab = (t: "player" | "team", label: string) => {
    const active = (t === "team") === (mode === "TEAM_ROSTER");
    return (
      <Link
        href={`/admin/registrations/new?type=${t}`}
        aria-current={active ? "page" : undefined}
        className={`inline-flex h-10 items-center rounded-lg border px-3 text-sm font-bold ${active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:bg-subtle"}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <>
      <PageTitle
        title={mode === "TEAM_ROSTER" ? "Register a team / roster" : "Register a player"}
        description="Enter a registration on behalf of a student or team official. It gets a reference, appears in the inbox and still needs Accept for screening. Give the applicant the reference: they can check its status at /register/status with the phone number entered here."
        back={{ href: "/admin/registrations", label: "Registrations" }}
      />
      <nav aria-label="Registration type" className="mb-4 flex gap-2">
        {tab("player", "Player")}
        {tab("team", "Team / roster")}
      </nav>
      <Card>
        <AdminRegistrationForm key={mode} options={options} mode={mode} />
      </Card>
    </>
  );
}
