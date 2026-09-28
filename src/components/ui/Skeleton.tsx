export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line/70 ${className}`} aria-hidden="true" />;
}

export function MatchRowSkeleton() {
  return (
    <div className="grid min-h-16 grid-cols-[3.25rem_1fr_1.5rem] items-center gap-x-2 px-3 py-2.5 sm:px-4">
      <Skeleton className="mx-auto h-3.5 w-9" />
      <div className="space-y-2.5 border-l border-line pl-3">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="ml-auto h-3.5 w-3" />
        <Skeleton className="ml-auto h-3.5 w-3" />
      </div>
    </div>
  );
}

export function MatchGroupSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="border-b border-line bg-subtle/60 px-3 py-2.5 sm:px-4">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <MatchRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Generic list-page skeleton with an accessible loading announcement. */
export function ListPageSkeleton({ title = true, groups = 2 }: { title?: boolean; groups?: number }) {
  return (
    <div role="status" aria-live="polite" className="pt-4 sm:pt-6">
      <span className="sr-only">Loading…</span>
      {title && <Skeleton className="mb-4 h-8 w-40" />}
      <div className="mb-5 flex gap-2">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: groups }, (_, i) => (
          <div key={i}>
            <Skeleton className="mb-3 h-5 w-28" />
            <MatchGroupSkeleton rows={i === 0 ? 3 : 2} />
          </div>
        ))}
      </div>
    </div>
  );
}
