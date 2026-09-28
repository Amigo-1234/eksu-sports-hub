import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveConsole } from "@/components/operator/LiveConsole";
import { operatorDataSource } from "@/lib/operator/data";
import { requireOperator } from "@/lib/operator/session";

export const metadata: Metadata = { title: "Live console" };

export default async function LiveConsolePage({ params }: PageProps<"/op/matches/[id]/live">) {
  const { id } = await params;
  const { operator, allowed } = await requireOperator();
  if (!allowed || !operator) return null;
  const seed = await operatorDataSource().getAssignmentSeed(operator, id);
  if (!seed) notFound();
  return <LiveConsole seed={seed} />;
}
