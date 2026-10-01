import type { Metadata } from "next";
import { StatusLookup } from "@/components/registration/StatusLookup";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Registration status" };

export default function RegistrationStatusPage() {
  return (
    <>
      <PageHeader title="Registration status" subtitle="Enter your reference and the phone number on the registration" />
      <StatusLookup />
    </>
  );
}
