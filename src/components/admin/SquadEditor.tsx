import { ActionForm, Submit } from "./ActionForm";
import { ConfirmAction } from "./ConfirmAction";
import { Disclosure } from "./Disclosure";
import { Badge, btn, Empty, Field, inputCls, selectCls, TableWrap, td, th } from "./ui";
import { addSquadPlayer, removeSquadPlayer, updateSquadPlayer } from "@/lib/admin/actions/teams";
import type { Squad, SquadPlayer } from "@/lib/admin/types";

const POS = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" } as const;

function PlayerFields({ p, squadId }: { p?: SquadPlayer; squadId: string }) {
  const sc = p?.id ?? `new-${squadId}`;
  return (
    <div className="grid gap-3 sm:grid-cols-[5rem_1fr_10rem_auto] sm:items-end">
      <input type="hidden" name="squad_id" value={squadId} />
      {p && <input type="hidden" name="id" value={p.id} />}
      {p && <input type="hidden" name="player_id" value={p.player_id} />}
      <Field scope={sc} label="Shirt">
        <input type="number" name="shirt_number" min={1} max={99} required defaultValue={p?.shirt_number} className={inputCls} />
      </Field>
      <Field scope={sc} label="Name (optional)" hint="Leave blank to show only the shirt number.">
        <input name="display_name" maxLength={80} defaultValue={p?.display_name ?? ""} className={inputCls} />
      </Field>
      <Field scope={sc} label="Position">
        <select name="position" defaultValue={p?.position ?? ""} className={selectCls}>
          <option value="">Not set</option>
          {Object.entries(POS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex h-11 items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="is_captain" defaultChecked={p?.is_captain} className="size-5 accent-brand-700" />
        Captain
      </label>
    </div>
  );
}

/** Squad for one team + season: shirt numbers are unique, one captain at most. */
export function SquadEditor({ squad }: { squad: Squad }) {
  return (
    <div>
      {squad.players.length === 0 ? (
        <Empty title="No players registered">Add players with their shirt numbers. Names are optional.</Empty>
      ) : (
        <TableWrap label={`Squad ${squad.season.name}`}>
          <table className="w-full min-w-[30rem]">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>#</th>
                <th className={th}>Player</th>
                <th className={th}>Role</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {squad.players.map((p) => (
                <tr key={p.id}>
                  <td className={`${td} font-display text-lg font-extrabold tabular-nums`}>{p.shirt_number}</td>
                  <td className={td}>
                    {p.display_name ?? <span className="text-ink-faint">Unnamed</span>}
                    <Disclosure summary="Edit">
                      <ActionForm action={updateSquadPlayer}>
                        <PlayerFields p={p} squadId={squad.id} />
                        <Submit className={`${btn.primary} mt-3`}>Save player</Submit>
                      </ActionForm>
                    </Disclosure>
                  </td>
                  <td className={td}>
                    <span className="flex flex-wrap gap-1">
                      {p.position === "GK" && <Badge tone="brand">GK</Badge>}
                      {p.position && p.position !== "GK" && <Badge tone="muted">{p.position}</Badge>}
                      {p.is_captain && <Badge tone="warn">Captain</Badge>}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    <ConfirmAction
                      action={removeSquadPlayer}
                      hidden={{ id: p.id, player_id: p.player_id }}
                      trigger="Remove"
                      triggerClass={btn.small}
                      title={`Remove #${p.shirt_number} from the squad?`}
                      body="Refused if the player already appears in recorded match events."
                      confirmLabel="Remove player"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <div className="mt-4 rounded-lg border border-line bg-canvas p-3">
        <h3 className="mb-2 text-sm font-extrabold uppercase">Add player</h3>
        <ActionForm action={addSquadPlayer} resetOnSuccess>
          <PlayerFields squadId={squad.id} />
          <Submit className={`${btn.primary} mt-3`}>Add player</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
