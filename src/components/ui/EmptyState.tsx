import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: { href: string; label: string };
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface text-center ${
        compact ? "px-4 py-6" : "px-5 py-10"
      }`}
    >
      {icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex h-10 items-center rounded-full bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
