import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Compact empty state: one slim row (icon, message, optional action) instead
 * of a tall placeholder box, so the next section stays in view.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: { href: string; label: string };
  /** @deprecated All empty states are compact now; kept for call-site compatibility. */
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-3 py-3 sm:px-4">
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-ink-faint" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-brand-600 hover:bg-brand-50"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
