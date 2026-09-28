import { MatchGroupSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="pt-2 sm:pt-4">
      <span className="sr-only">Loading match…</span>
      <Skeleton className="mb-2 h-9 w-20 rounded-full" />
      <div className="-mx-3 bg-brand-800 px-4 py-6 sm:mx-0 sm:rounded-card">
        <div className="grid grid-cols-3 items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className={`animate-pulse rounded bg-white/15 ${i === 1 ? "h-12 w-24" : "h-14 w-12"}`} />
              <div className="h-3 w-16 animate-pulse rounded bg-white/15" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex h-12 gap-4 border-b border-line">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="my-auto h-3 flex-1" />
        ))}
      </div>
      <div className="mt-4">
        <MatchGroupSkeleton rows={4} />
      </div>
    </div>
  );
}
