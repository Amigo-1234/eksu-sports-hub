import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-5 h-9 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-5 h-64 rounded-card" />
    </div>
  );
}
