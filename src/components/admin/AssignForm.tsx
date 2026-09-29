import { assignOperators } from "@/lib/admin/actions/matches";
import type { StaffMember } from "@/lib/admin/types";
import { ActionForm, Submit } from "./ActionForm";
import { btn, Field, selectCls } from "./ui";

/** PRIMARY (+ optional BACKUP) in one step; admin_assign_operators replaces the previous pair atomically. */
export function AssignForm({
  matchId,
  operators,
  primary,
  backup,
  compact = false,
}: {
  matchId: string;
  operators: StaffMember[];
  primary?: string;
  backup?: string;
  compact?: boolean;
}) {
  const opts = operators.map((o) => (
    <option key={o.user_id} value={o.user_id}>
      {o.display_name}
      {o.roles.includes("OPERATOR") ? "" : ` (${o.roles.join(", ").toLowerCase()})`}
    </option>
  ));
  return (
    <ActionForm action={assignOperators} className={compact ? "min-w-0" : ""}>
      <input type="hidden" name="match_id" value={matchId} />
      <div className={`grid gap-2 ${compact ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-2"} sm:items-end`}>
        <Field scope={matchId} label="Primary">
          <select name="primary" required defaultValue={primary ?? ""} className={selectCls}>
            <option value="" disabled>
              Choose operator
            </option>
            {opts}
          </select>
        </Field>
        <Field scope={matchId} label="Backup (optional)">
          <select name="backup" defaultValue={backup ?? ""} className={selectCls}>
            <option value="">None</option>
            {opts}
          </select>
        </Field>
        <Submit className={compact ? btn.primary : `${btn.primary} sm:col-span-2 sm:justify-self-start`} pendingLabel="Assigning…">
          {primary ? "Update" : "Assign"}
        </Submit>
      </div>
    </ActionForm>
  );
}
