import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

type ControlProps = { id?: string; name?: string; defaultValue?: unknown; value?: unknown; "aria-describedby"?: string };

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Labelled form control: <label for> + control id, with the hint linked by
 * aria-describedby. Ids are deterministic (no hooks), so this renders the
 * same in Server Components and on both sides of hydration.
 */
export function Field({
  label,
  hint,
  children,
  className = "",
  scope = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Distinguishes identical fields in repeated forms on one page (e.g. a record id). */
  scope?: string;
}) {
  let control = children;
  let id: string | undefined;
  if (isValidElement(children) && children.type !== Fragment) {
    const p = (children as ReactElement<ControlProps>).props;
    id = p.id ?? `f-${hash(`${scope}|${label}|${p.name ?? ""}|${String(p.defaultValue ?? p.value ?? "")}`)}`;
    control = cloneElement(children as ReactElement<ControlProps>, { id, ...(hint ? { "aria-describedby": `${id}-hint` } : {}) });
  }
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
      </label>
      {control}
      {hint && (
        <span id={id ? `${id}-hint` : undefined} className="mt-1 block text-xs text-ink-muted">
          {hint}
        </span>
      )}
    </div>
  );
}
