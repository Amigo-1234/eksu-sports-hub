import type { CompetitionDetail, Season, Sport } from "@/lib/admin/types";
import { TIEBREAKERS } from "@/lib/admin/types";
import { Check, Field, inputCls, selectCls } from "./ui";

const TB_LABEL: Record<string, string> = {
  points: "Points",
  goal_difference: "Goal difference",
  goals_for: "Goals scored",
  wins: "Wins",
};

export function CompetitionFields({ c, seasons, sports }: { c?: CompetitionDetail; seasons: Season[]; sports: Sport[] }) {
  const tb = c?.tiebreakers ?? ["points", "goal_difference", "goals_for"];
  const current = seasons.find((s) => s.is_current)?.id;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Name">
        <input name="name" required maxLength={120} defaultValue={c?.name} placeholder="Inter-Faculty Football League" className={inputCls} />
      </Field>
      <Field label="Short name">
        <input name="short_name" required maxLength={40} defaultValue={c?.short_name} placeholder="IFL" className={inputCls} />
      </Field>
      <Field label="Season">
        <select name="season_id" required defaultValue={c?.season_id ?? current} className={selectCls}>
          {seasons
            .filter((s) => !s.archived_at || s.id === c?.season_id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_current ? " (current)" : ""}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Sport">
        <select name="sport_id" required defaultValue={c?.sport_id} className={selectCls}>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Format" hint="Groups and knockout rounds are modelled as stages.">
        <select name="format" defaultValue={c?.format ?? "LEAGUE"} className={selectCls}>
          <option value="LEAGUE">League</option>
          <option value="KNOCKOUT">Knockout</option>
          <option value="GROUPS_KNOCKOUT">Groups + knockout</option>
        </select>
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={c?.category ?? "MEN"} className={selectCls}>
          <option value="MEN">Men</option>
          <option value="WOMEN">Women</option>
          <option value="MIXED">Mixed</option>
        </select>
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea name="description" rows={2} maxLength={1000} defaultValue={c?.description} className={`${inputCls} h-auto py-2`} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-bold">Points</legend>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Win">
            <input type="number" name="points_win" min={0} max={10} required defaultValue={c?.points_win ?? 3} className={inputCls} />
          </Field>
          <Field label="Draw">
            <input type="number" name="points_draw" min={0} max={10} required defaultValue={c?.points_draw ?? 1} className={inputCls} />
          </Field>
          <Field label="Loss">
            <input type="number" name="points_loss" min={0} max={10} required defaultValue={c?.points_loss ?? 0} className={inputCls} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-bold">Table order (tie-breakers)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Field key={i} label={`${i + 1}${["st", "nd", "rd", "th"][i]}`}>
              <select name="tiebreakers" defaultValue={tb[i] ?? ""} className={selectCls}>
                <option value="">—</option>
                {TIEBREAKERS.map((t) => (
                  <option key={t} value={t}>
                    {TB_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Check name="extra_time_enabled" label="Extra time" defaultChecked={c?.extra_time_enabled} hint="Competition rule. The operator console currently records regulation time (two halves) only." />
        <Check name="penalties_enabled" label="Penalty shoot-outs" defaultChecked={c?.penalties_enabled} hint="Competition rule. Shoot-outs are not yet recorded by the operator console." />
        <Check
          name="allow_multi_team_players"
          label="Players may represent more than one entered team"
          defaultChecked={c?.allow_multi_team_players}
          hint="Off (normal): a player active in two teams' squads cannot play for both in this competition. Playing for different teams in different competitions is always allowed."
        />
      </div>
    </div>
  );
}

export const FORMAT_LABEL = { LEAGUE: "League", KNOCKOUT: "Knockout", GROUPS_KNOCKOUT: "Groups + knockout" } as const;
