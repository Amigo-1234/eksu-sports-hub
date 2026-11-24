"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { submitOperatorApplication } from "@/app/(public)/apply/operator/actions";
import { DAYS, LIMITS, PERIODS, QUESTIONS, validateApplication, type ApplicationInput } from "@/lib/operator-applications/shared";

type Errors = Partial<Record<keyof ApplicationInput, string>>;

const EMPTY: ApplicationInput = {
  full_name: "",
  email: "",
  phone: "",
  department: "",
  level: "",
  experience: "",
  available_days: [],
  periods: [],
  can_attend: null,
  answer_why: "",
  answer_wrong_goal: "",
  answer_offline: "",
  commits_accuracy: null,
  consent: false,
};

const input =
  "block w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] text-ink placeholder:text-ink-faint transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25 aria-[invalid=true]:border-loss";

export function OperatorApplyForm() {
  const router = useRouter();
  const [v, setV] = useState<ApplicationInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  const set = <K extends keyof ApplicationInput>(k: K, val: ApplicationInput[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const toggle = (k: "available_days" | "periods", item: string, max: number) => {
    const cur = v[k];
    if (cur.includes(item)) set(k, cur.filter((x) => x !== item));
    else if (cur.length < max) set(k, [...cur, item]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validateApplication(v);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFormError("Please check the highlighted answers.");
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>("[aria-invalid=true], [data-invalid=true] input");
        (first ?? summary.current)?.focus();
      });
      return;
    }
    setBusy(true);
    const res = await submitOperatorApplication({ ...v, website: honeypot.current?.value ?? "", startedAt });
    if (res.ok) {
      const q = new URLSearchParams();
      if (res.reference) q.set("ref", res.reference);
      if (res.practice) q.set("practice", res.practice);
      router.push(`/apply/operator/submitted${q.size ? `?${q}` : ""}`);
      return;
    }
    setBusy(false);
    setErrors((res.fields as Errors) ?? {});
    setFormError(res.error);
    requestAnimationFrame(() => summary.current?.focus());
  }

  const daysFull = v.available_days.length >= 3;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div ref={summary} tabIndex={-1} aria-live="assertive" className="outline-none">
        {formError && (
          <p className="rounded-xl border border-loss/40 bg-live-soft px-4 py-3 text-sm font-semibold text-loss" role="alert">
            {formError}
          </p>
        )}
      </div>

      {/* Spam trap: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Section step={1} title="About you">
        <TextField id="full_name" label="Full name" required value={v.full_name} error={errors.full_name} onChange={(x) => set("full_name", x)} autoComplete="name" />
        <TextField id="email" label="Email address" required type="email" value={v.email} error={errors.email} onChange={(x) => set("email", x)} autoComplete="email" hint="We will contact you here about your application." />
        <TextField id="phone" label="Phone / WhatsApp number" type="tel" value={v.phone} error={errors.phone} onChange={(x) => set("phone", x)} autoComplete="tel" placeholder="080 1234 5678" />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <TextField id="department" label="Department" optional value={v.department} error={errors.department} onChange={(x) => set("department", x)} placeholder="e.g. Civil Engineering" />
          <TextField id="level" label="Level" optional value={v.level} error={errors.level} onChange={(x) => set("level", x)} placeholder="e.g. 300L" />
        </div>
        <AreaField
          id="experience"
          label="Experience officiating or reporting football"
          optional
          rows={3}
          max={LIMITS.experience[1]}
          value={v.experience}
          error={errors.experience}
          onChange={(x) => set("experience", x)}
          hint="Refereeing, scoring, commentary, sports journalism or social media coverage — anything counts. None is fine too."
        />
      </Section>

      <Section step={2} title="Availability">
        <fieldset data-invalid={!!errors.available_days} aria-describedby="days-hint">
          <legend className="text-[15px] font-bold">
            Days you are available each week <span className="text-loss">*</span>
          </legend>
          <p id="days-hint" className="mt-0.5 text-[13px] text-ink-muted">
            Choose 2 or 3 days. <span className="font-semibold text-ink">{v.available_days.length}/3 selected</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {DAYS.map(([k, label]) => {
              const on = v.available_days.includes(k);
              return (
                <Chip key={k} checked={on} disabled={!on && daysFull} onChange={() => toggle("available_days", k, 3)}>
                  {label}
                </Chip>
              );
            })}
          </div>
          <FieldError id="available_days" error={errors.available_days} />
        </fieldset>

        <fieldset data-invalid={!!errors.periods}>
          <legend className="text-[15px] font-bold">
            Preferred times <span className="text-loss">*</span>
          </legend>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
            {PERIODS.map(([k, label, hours]) => (
              <Chip key={k} checked={v.periods.includes(k)} onChange={() => toggle("periods", k, 3)} block>
                <span className="block">{label}</span>
                <span className="block text-xs font-medium opacity-75">{hours}</span>
              </Chip>
            ))}
          </div>
          <FieldError id="periods" error={errors.periods} />
        </fieldset>

        <YesNo id="can_attend" legend="Can you attend matches in person at the pitch?" value={v.can_attend} error={errors.can_attend} onChange={(x) => set("can_attend", x)} />
      </Section>

      <Section step={3} title="A few questions" description="There are no trick questions — we want to understand how you think on match day.">
        <AreaField id="answer_why" label={QUESTIONS.why} required rows={4} max={LIMITS.why[1]} value={v.answer_why} error={errors.answer_why} onChange={(x) => set("answer_why", x)} />
        <AreaField id="answer_wrong_goal" label={QUESTIONS.wrongGoal} required rows={3} max={LIMITS.answer[1]} value={v.answer_wrong_goal} error={errors.answer_wrong_goal} onChange={(x) => set("answer_wrong_goal", x)} />
        <AreaField id="answer_offline" label={QUESTIONS.offline} required rows={3} max={LIMITS.answer[1]} value={v.answer_offline} error={errors.answer_offline} onChange={(x) => set("answer_offline", x)} />
        <YesNo id="commits_accuracy" legend={QUESTIONS.commit} value={v.commits_accuracy} error={errors.commits_accuracy} onChange={(x) => set("commits_accuracy", x)} />
      </Section>

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={v.consent}
            onChange={(e) => set("consent", e.target.checked)}
            aria-invalid={!!errors.consent}
            aria-describedby={errors.consent ? "consent-error" : undefined}
            className="mt-0.5 size-5 shrink-0 accent-brand-700"
          />
          <span className="text-sm leading-relaxed">
            I understand that my details are seen only by the EKSU Sports Hub administrators, are used only to review this application and
            contact me about it, and are never shown publicly.
          </span>
        </label>
        <FieldError id="consent" error={errors.consent} />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-700 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-60"
      >
        {busy ? "Sending your application…" : "Submit application"}
      </button>
      <p className="text-center text-xs text-ink-faint">No account needed. You will get a reference number when you submit.</p>
    </form>
  );
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`apply-step-${step}`} className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 font-display text-base font-bold text-white" aria-hidden="true">
          {step}
        </span>
        <div>
          <h2 id={`apply-step-${step}`} className="font-display text-[22px] leading-tight font-extrabold tracking-[0.01em] uppercase">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Label({ id, label, required, optional }: { id: string; label: string; required?: boolean; optional?: boolean }) {
  return (
    <label htmlFor={id} className="block text-[15px] font-bold">
      {label}
      {required && <span className="text-loss"> *</span>}
      {optional && <span className="font-medium text-ink-faint"> (optional)</span>}
    </label>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="mt-1.5 text-[13px] font-semibold text-loss">
      {error}
    </p>
  );
}

function TextField({
  id, label, value, onChange, error, required, optional, type = "text", hint, placeholder, autoComplete,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; optional?: boolean;
  type?: string; hint?: string; placeholder?: string; autoComplete?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <Label id={id} label={label} required={required} optional={optional} />
      {hint && <p id={`${id}-hint`} className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        aria-required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${input} mt-1.5 h-12`}
      />
      <FieldError id={id} error={error} />
    </div>
  );
}

function AreaField({
  id, label, value, onChange, error, required, optional, rows, max, hint,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; optional?: boolean;
  rows: number; max: number; hint?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null, `${id}-count`].filter(Boolean).join(" ");
  return (
    <div>
      <Label id={id} label={label} required={required} optional={optional} />
      {hint && <p id={`${id}-hint`} className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
      <textarea
        id={id}
        rows={rows}
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        aria-required={required}
        className={`${input} mt-1.5 py-3 leading-relaxed`}
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        <FieldError id={id} error={error} />
        <span id={`${id}-count`} className="ml-auto shrink-0 text-xs text-ink-faint tabular-nums">
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}

function Chip({ checked, disabled, onChange, block, children }: { checked: boolean; disabled?: boolean; onChange: () => void; block?: boolean; children: ReactNode }) {
  return (
    <label
      className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-4 py-2 text-center text-sm font-bold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600/40 ${
        block ? "w-full" : ""
      } ${
        checked
          ? "border-brand-700 bg-brand-700 text-white"
          : disabled
            ? "cursor-not-allowed border-line bg-subtle text-ink-faint"
            : "border-line-strong bg-surface text-ink hover:border-brand-600 hover:bg-brand-50"
      }`}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span>{children}</span>
    </label>
  );
}

function YesNo({ id, legend, value, onChange, error }: { id: string; legend: string; value: boolean | null; onChange: (v: boolean) => void; error?: string }) {
  return (
    <fieldset data-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-[15px] font-bold">
        {legend} <span className="text-loss">*</span>
      </legend>
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:max-w-xs">
        {([true, false] as const).map((opt) => (
          <label
            key={String(opt)}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-bold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600/40 ${
              value === opt ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink hover:border-brand-600 hover:bg-brand-50"
            }`}
          >
            <input type="radio" name={id} checked={value === opt} onChange={() => onChange(opt)} className="sr-only" />
            {opt ? "Yes" : "No"}
          </label>
        ))}
      </div>
      <FieldError id={id} error={error} />
    </fieldset>
  );
}
