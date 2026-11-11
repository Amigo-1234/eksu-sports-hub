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
    <div className="flex items-center justify-between gap-3 pt-3 pb-2.5 sm:pt-5 sm:pb-3">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-none font-extrabold tracking-[0.01em] uppercase sm:text-[30px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
