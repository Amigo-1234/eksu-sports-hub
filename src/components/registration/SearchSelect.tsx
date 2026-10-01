"use client";

import { useId, useMemo, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Searchable single-select (ARIA combobox + listbox). Type to filter, arrow
 * keys to move, Enter to pick, Escape to close. Large touch targets.
 */
export function SearchSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
  error,
  required,
  disabled,
}: {
  id: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const pick = (o: Option) => {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
        {required && <span className="text-loss"> *</span>}
      </label>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && filtered[active]) {
            e.preventDefault();
            pick(filtered[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        className={`h-12 w-full min-w-0 rounded-lg border bg-surface px-3 pr-9 text-base text-ink placeholder:text-ink-faint focus:border-ink disabled:bg-subtle ${
          error ? "border-loss" : "border-line-strong"
        }`}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3.5 text-ink-faint">
        ▾
      </span>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-lg">
          {filtered.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 text-sm ${i === active ? "bg-brand-50" : ""} ${
                o.value === value ? "font-bold text-brand-700" : ""
              }`}
            >
              {o.label}
              {o.hint && <span className="text-xs font-normal text-ink-muted">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
