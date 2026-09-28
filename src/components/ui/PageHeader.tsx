import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 pt-4 pb-3 sm:pt-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
