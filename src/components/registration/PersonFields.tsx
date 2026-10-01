"use client";

import type { RegFaculty } from "@/lib/registration/public";
import { LEVEL_LABEL, LEVELS, POSITION_LABEL, POSITIONS, cleanPhone, isPhone, normaliseMatric } from "@/lib/registration/rules";
import { DocumentInput, type UploadedDoc } from "./DocumentInput";
import { SearchSelect } from "./SearchSelect";

export interface Person {
  id: string;
  full_name: string;
  matric_number: string;
  faculty_id: string;
  department_id: string;
  level: string;
  phone: string;
  position: string;
  photo: UploadedDoc | null;
  idDoc: UploadedDoc | null;
}
export type Errors = Partial<Record<keyof Person, string>>;
export type Section = "personal" | "academic" | "football" | "documents";

export const emptyPerson = (): Person => ({
  id: crypto.randomUUID(),
  full_name: "",
  matric_number: "",
  faculty_id: "",
  department_id: "",
  level: "",
  phone: "",
  position: "",
  photo: null,
  idDoc: null,
});

/** Field checks per section (Postgres repeats all of them). */
export function personErrors(p: Person, faculties: RegFaculty[], sections: Section[], opts: { phoneRequired?: boolean } = {}): Errors {
  const e: Errors = {};
  if (sections.includes("personal")) {
    const n = p.full_name.trim();
    if (n.length < 2) e.full_name = "Enter the full name.";
    else if (n.length > 80) e.full_name = "Keep the name under 80 characters.";
    if (opts.phoneRequired ? !isPhone(p.phone) : p.phone.trim() !== "" && !isPhone(p.phone)) e.phone = "Enter a valid phone number, e.g. 08031234567.";
  }
  if (sections.includes("academic")) {
    const m = normaliseMatric(p.matric_number);
    if (m.length < 3 || m.length > 40) e.matric_number = "Enter the matric / student number.";
    const f = faculties.find((x) => x.id === p.faculty_id);
    if (!f) e.faculty_id = "Choose the faculty.";
    else if (f.departments.length > 0 && !f.departments.some((d) => d.id === p.department_id)) e.department_id = "Choose the department.";
    if (!(LEVELS as readonly string[]).includes(p.level)) e.level = "Choose the level.";
  }
  if (sections.includes("football") && !(POSITIONS as readonly string[]).includes(p.position)) e.position = "Choose a preferred position.";
  if (sections.includes("documents")) {
    if (!p.photo) e.photo = "Upload a passport photograph.";
  }
  return e;
}

export const inputCls = (bad?: string) =>
  `h-12 w-full min-w-0 rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-ink-faint focus:border-ink ${bad ? "border-loss" : "border-line-strong"}`;

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  hint,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
  const described = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
        {required && <span className="text-loss"> *</span>}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={inputCls(error)}
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-loss">
          {error}
        </p>
      )}
    </div>
  );
}

export function PersonSection({
  section,
  person,
  set,
  errors,
  faculties,
  getToken,
  phoneRequired,
  idPrefix,
}: {
  section: Section;
  person: Person;
  set: (patch: Partial<Person>) => void;
  errors: Errors;
  faculties: RegFaculty[];
  getToken: () => Promise<string | null>;
  phoneRequired?: boolean;
  idPrefix: string;
}) {
  const faculty = faculties.find((f) => f.id === person.faculty_id);
  const fid = (k: string) => `${idPrefix}-${k}`;
  if (section === "personal") {
    return (
      <div className="space-y-4">
        <TextField
          id={fid("name")}
          label="Full name"
          required
          value={person.full_name}
          onChange={(v) => set({ full_name: v })}
          error={errors.full_name}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={80}
          hint="As it appears on the student ID card."
        />
        <TextField
          id={fid("phone")}
          label={phoneRequired ? "Phone number" : "Phone number (optional)"}
          required={phoneRequired}
          value={person.phone}
          onChange={(v) => set({ phone: v })}
          onBlur={() => set({ phone: cleanPhone(person.phone) })}
          error={errors.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          placeholder="08031234567"
        />
      </div>
    );
  }
  if (section === "academic") {
    return (
      <div className="space-y-4">
        <TextField
          id={fid("matric")}
          label="Matric / student number"
          required
          value={person.matric_number}
          onChange={(v) => set({ matric_number: v })}
          error={errors.matric_number}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="e.g. CSC/22/1234"
        />
        <SearchSelect
          id={fid("faculty")}
          label="Faculty"
          required
          options={faculties.map((f) => ({ value: f.id, label: f.name }))}
          value={person.faculty_id}
          onChange={(v) => set({ faculty_id: v, department_id: v === person.faculty_id ? person.department_id : "" })}
          placeholder="Search faculties"
          error={errors.faculty_id}
        />
        {faculty && faculty.departments.length > 0 && (
          <SearchSelect
            id={fid("department")}
            label="Department"
            required
            options={faculty.departments.map((d) => ({ value: d.id, label: d.name }))}
            value={person.department_id}
            onChange={(v) => set({ department_id: v })}
            placeholder="Search departments"
            error={errors.department_id}
          />
        )}
        <div>
          <label htmlFor={fid("level")} className="mb-1 block text-sm font-bold">
            Level <span className="text-loss">*</span>
          </label>
          <select
            id={fid("level")}
            value={person.level}
            onChange={(e) => set({ level: e.target.value })}
            aria-invalid={errors.level ? true : undefined}
            className={`${inputCls(errors.level)} pr-8`}
          >
            <option value="">Choose level</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          {errors.level && <p className="mt-1 text-sm font-semibold text-loss">{errors.level}</p>}
        </div>
      </div>
    );
  }
  if (section === "football") {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-bold">
          Preferred position <span className="text-loss">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {POSITIONS.map((p) => (
            <label
              key={p}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                errors.position ? "border-loss" : "border-line-strong"
              }`}
            >
              <input type="radio" name={fid("position")} value={p} checked={person.position === p} onChange={() => set({ position: p })} className="sr-only" />
              <span className="w-9 shrink-0 font-mono text-xs font-bold">{p}</span>
              <span className="min-w-0">{POSITION_LABEL[p]}</span>
            </label>
          ))}
        </div>
        {errors.position && <p className="mt-1 text-sm font-semibold text-loss">{errors.position}</p>}
      </fieldset>
    );
  }
  return (
    <div className="space-y-3">
      <DocumentInput
        kind="photo"
        label="Passport photograph"
        hint="A clear, recent photo of your face. JPG, PNG or WebP, max 4 MB."
        personId={person.id}
        value={person.photo}
        onChange={(d) => set({ photo: d })}
        getToken={getToken}
        error={errors.photo}
      />
      <DocumentInput
        kind="id"
        label="Student ID evidence (optional)"
        optional
        hint="Student ID card, course registration form or admission letter, if you have it. Photo or PDF, max 4 MB. You can also bring it to screening."
        personId={person.id}
        value={person.idDoc}
        onChange={(d) => set({ idDoc: d })}
        getToken={getToken}
        error={errors.idDoc}
      />
      <p className="text-xs text-ink-muted">Documents are stored privately and only the Sports Directorate can view them.</p>
    </div>
  );
}
