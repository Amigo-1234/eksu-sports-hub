import { STAGE_TYPE_LABEL, STAGE_TYPES, type Stage } from "@/lib/admin/types";
import { Field, inputCls, selectCls } from "./ui";

const tri = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");

/**
 * Stage settings: type (league/group/knockout round), legs, extra time /
 * penalties (inherit from the competition by default) and qualification.
 * Shared by "Add stage" and "Edit stage".
 */
export function StageFields({ stage, scope, nextOrder }: { stage?: Stage; scope: string; nextOrder?: number }) {
  const q = stage?.qualification ?? {};
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field scope={scope} label="Name">
        <input name="name" required maxLength={60} defaultValue={stage?.name} placeholder="Quarter-finals" className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field scope={scope} label="Order">
          <input type="number" name="stage_order" min={1} max={20} required defaultValue={stage?.stage_order ?? nextOrder} className={inputCls} />
        </Field>
        <Field scope={scope} label="Legs" hint="League/group: 2 = home and away">
          <select name="legs" defaultValue={String(stage?.legs ?? 1)} className={selectCls}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </Field>
      </div>
      <Field scope={scope} label="Stage type">
        <select name="stage_type" defaultValue={stage?.stage_type ?? "LEAGUE"} className={selectCls}>
          {STAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {STAGE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field scope={scope} label="Extra time" hint="Knockout only">
          <select name="extra_time" defaultValue={tri(stage?.extra_time_allowed)} className={selectCls}>
            <option value="">Competition default</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        <Field scope={scope} label="Penalties" hint="Knockout only">
          <select name="penalties" defaultValue={tri(stage?.penalties_allowed)} className={selectCls}>
            <option value="">Competition default</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-bold">Qualification (league / group stages)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field scope={scope} label="Per group" hint="e.g. top 2">
            <input type="number" name="per_group" min={1} max={16} defaultValue={q.per_group ?? ""} className={inputCls} />
          </Field>
          <Field scope={scope} label="League top" hint="e.g. top 4">
            <input type="number" name="top" min={1} max={64} defaultValue={q.top ?? ""} className={inputCls} />
          </Field>
          <Field scope={scope} label="Best-ranked place" hint="e.g. 3rd">
            <input type="number" name="best_rank" min={2} max={8} defaultValue={q.best_ranked?.rank ?? ""} className={inputCls} />
          </Field>
          <Field scope={scope} label="How many" hint="e.g. best 2">
            <input type="number" name="best_count" min={1} max={16} defaultValue={q.best_ranked?.count ?? ""} className={inputCls} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
