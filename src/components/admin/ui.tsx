import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchStatus } from "@/lib/admin/types";

/* Shared admin styling. Tokens come from globals.css. */
export const inputCls =
  "h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink disabled:bg-subtle";
export const selectCls = `${inputCls} pr-8`;
export const btn = {
  primary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-bold text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-live px-4 text-sm font-bold text-white hover:bg-loss disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60",
  small:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-xs font-bold text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60",
};

export function PageTitle({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex h-8 items-center text-sm font-semibold text-brand-700 hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight font-extrabold break-words uppercase">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, id, className = "" }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`min-w-0 scroll-mt-20 rounded-card border border-line bg-surface ${className}`} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="font-display text-lg leading-tight font-bold uppercase">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export { Field } from "./Field";

export function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-1">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-brand-700" />
      <span className="text-sm">
        <span className="font-bold">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

type Tone = "neutral" | "live" | "ok" | "warn" | "bad" | "brand" | "muted";
const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-subtle text-ink",
  live: "border-live bg-live text-white",
  ok: "border-win/40 bg-win/10 text-win",
  warn: "border-warn/40 bg-warn-soft text-warn",
  bad: "border-loss/40 bg-live-soft text-loss",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  muted: "border-line bg-surface text-ink-muted",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded border px-1.5 text-[11px] font-extrabold tracking-wide whitespace-nowrap uppercase ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS: Record<MatchStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "Scheduled", tone: "neutral" },
  "1H": { label: "Live · 1st half", tone: "live" },
  HT: { label: "Half-time", tone: "warn" },
  "2H": { label: "Live · 2nd half", tone: "live" },
  ET1: { label: "Live · extra time", tone: "live" },
  ET_BREAK: { label: "Extra-time break", tone: "warn" },
  ET2: { label: "Live · extra time", tone: "live" },
  PENS: { label: "Penalties", tone: "live" },
  FT: { label: "Full-time", tone: "muted" },
  POSTPONED: { label: "Postponed", tone: "warn" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
  ABANDONED: { label: "Abandoned", tone: "bad" },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
export const statusLabel = (s: MatchStatus) => STATUS[s].label;

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
      <p className="font-bold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** Horizontal scroll stays inside the table, never on the page. */
export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
export const th = "px-2 py-2 text-left text-xs font-extrabold tracking-wide text-ink-muted uppercase whitespace-nowrap";
export const td = "px-2 py-2.5 align-top text-sm";

export function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-4 shrink-0 rounded-sm border border-line-strong" style={{ background: color }} aria-hidden="true" />;
}
