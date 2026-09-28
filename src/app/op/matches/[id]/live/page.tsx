import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveConsole } from "@/components/operator/LiveConsole";
import { getAssignmentSeed, getCurrentOperator } from "@/lib/operator/data";

export const metadata: Metadata = { title: "Live console" };

export default async function LiveConsolePage({ params }: PageProps<"/op/matches/[id]/live">) {
  const { id } = await params;
  const operator = await getCurrentOperator();
  const seed = await getAssignmentSeed(operator.id, id);
  if (!seed) notFound();
  return <LiveConsole seed={seed} />;
}
