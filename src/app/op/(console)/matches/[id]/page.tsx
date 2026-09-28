import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchPrep } from "@/components/operator/MatchPrep";
import { operatorDataSource } from "@/lib/operator/data";
import { requireOperator } from "@/lib/operator/session";

export const metadata: Metadata = { title: "Match prep" };

export default async function MatchPrepPage({ params }: PageProps<"/op/matches/[id]">) {
  const { id } = await params;
  const { operator, allowed } = await requireOperator();
  if (!allowed || !operator) return null;
  const seed = await operatorDataSource().getAssignmentSeed(operator, id);
  if (!seed) notFound();
  return <MatchPrep seed={seed} />;
}
