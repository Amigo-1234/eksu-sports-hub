import type { Metadata } from "next";
import Link from "next/link";
import { AssignmentList } from "@/components/operator/AssignmentList";
import { getNow } from "@/lib/data";
import { dateKey } from "@/lib/format";
import { operatorDataSource } from "@/lib/operator/data";
import { requireOperator } from "@/lib/operator/session";

export const metadata: Metadata = { title: "Assignments" };

export default async function AllAssignments() {
  const { operator, allowed } = await requireOperator();
  if (!allowed || !operator) return null;
  const [seeds, now] = await Promise.all([operatorDataSource().getAssignmentSeeds(operator), getNow()]);
  return (
    <>
      <div className="pt-4">
        <Link href="/op" className="inline-flex h-11 items-center text-sm font-bold text-ink-muted">← My matches</Link>
        <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight uppercase">All assignments</h1>
      </div>
      <AssignmentList seeds={seeds} todayKey={dateKey(now)} />
    </>
  );
}
