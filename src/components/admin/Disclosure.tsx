import type { ReactNode } from "react";

/** Native <details> for inline edit forms (keyboard accessible, no JS). */
export function Disclosure({ summary, children, className = "" }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group min-w-0 ${className}`}>
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1 rounded-md px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90" aria-hidden="true">
          ▸
        </span>
        {summary}
      </summary>
      <div className="mt-2 rounded-lg border border-line bg-canvas p-3">{children}</div>
    </details>
  );
}
