import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchPrep } from "@/components/operator/MatchPrep";
import { getAssignmentSeed, getCurrentOperator } from "@/lib/operator/data";

export const metadata: Metadata = { title: "Match prep" };

export default async function MatchPrepPage({ params }: PageProps<"/op/matches/[id]">) {
  const { id } = await params;
  const operator = await getCurrentOperator();
  const seed = await getAssignmentSeed(operator.id, id);
  if (!seed) notFound();
  return <MatchPrep seed={seed} />;
}
