import type { Faculty, Sport, Team } from "@/lib/admin/types";
import { Field, inputCls, selectCls } from "./ui";

/** No crest upload: Supabase Storage is not provisioned for this project yet (see docs/ADMIN.md). */
export function TeamFields({ t, faculties, sports }: { t?: Team; faculties: Faculty[]; sports: Sport[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Full name">
        <input name="name" required maxLength={80} defaultValue={t?.name} placeholder="Faculty of Science" className={inputCls} />
      </Field>
      <Field label="Short name" hint="Used in fixture lists">
        <input name="short_name" required maxLength={30} defaultValue={t?.short_name} placeholder="Science" className={inputCls} />
      </Field>
      <Field label="Code" hint="2–4 letters, e.g. SCI">
        <input name="code" required minLength={2} maxLength={4} defaultValue={t?.code} className={`${inputCls} uppercase`} />
      </Field>
      <Field label="Slug" hint="Public URL name. Leave blank to generate from the name.">
        <input name="slug" maxLength={60} defaultValue={t?.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={`${inputCls} font-mono`} />
      </Field>
      <Field label="Team type">
        <select name="kind" defaultValue={t?.kind ?? "FACULTY"} className={selectCls}>
          <option value="FACULTY">Faculty team</option>
          <option value="DEPARTMENT">Department team</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={t?.category ?? "MEN"} className={selectCls}>
          <option value="MEN">Men</option>
          <option value="WOMEN">Women</option>
          <option value="MIXED">Mixed</option>
        </select>
      </Field>
      <Field label="Sport">
        <select name="sport_id" required defaultValue={t?.sport_id} className={selectCls}>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Faculty">
        <select name="faculty_id" defaultValue={t?.faculty_id ?? ""} className={selectCls}>
          <option value="">None</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Department">
        <select name="department_id" defaultValue={t?.department_id ?? ""} className={selectCls}>
          <option value="">None</option>
          {faculties.map((f) =>
            f.departments.length ? (
              <optgroup key={f.id} label={f.name}>
                {f.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary colour">
          <input type="color" name="color_primary" defaultValue={t?.color_primary ?? "#761530"} className="h-11 w-full rounded-lg border border-line-strong bg-surface p-1" />
        </Field>
        <Field label="Secondary colour">
          <input type="color" name="color_secondary" defaultValue={t?.color_secondary ?? "#ffffff"} className="h-11 w-full rounded-lg border border-line-strong bg-surface p-1" />
        </Field>
      </div>
    </div>
  );
}
