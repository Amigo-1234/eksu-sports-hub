import Link from "next/link";
import { AssignmentList } from "@/components/operator/AssignmentList";
import { getNow } from "@/lib/data";
import { dateKey, formatLongDate } from "@/lib/format";
import { getAssignmentSeeds, getCurrentOperator } from "@/lib/operator/data";

export default async function OperatorHome() {
  const operator = await getCurrentOperator();
  const [seeds, now] = await Promise.all([getAssignmentSeeds(operator.id), getNow()]);
  return (
    <>
      <div className="pt-4">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{formatLongDate(new Date(now).toISOString())}</p>
        <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight uppercase">My matches</h1>
        <p className="text-sm text-ink-muted">Only matches assigned to you are shown.</p>
      </div>
      <AssignmentList seeds={seeds} todayKey={dateKey(now)} upcomingLimit={3} completedLimit={3} />
      <Link
        href="/op/matches"
        className="mt-6 flex h-12 items-center justify-center rounded-xl border-2 border-ink font-bold hover:bg-subtle"
      >
        All assignments
      </Link>
    </>
  );
}
