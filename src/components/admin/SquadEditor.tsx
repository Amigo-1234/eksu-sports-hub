import Link from "next/link";
import { ActionForm, Submit } from "./ActionForm";
import { ConfirmAction } from "./ConfirmAction";
import { Disclosure } from "./Disclosure";
import { EligibilityBadge } from "./Screening";
import { Badge, btn, Check, Empty, Field, inputCls, selectCls } from "./ui";
import { addSquadPlayer, setSquadPlayerActive, updateSquadPlayer } from "@/lib/admin/actions/players";
import type { SquadMemberRow } from "@/lib/admin/data/players";

const POS = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" } as const;

function PositionSelect({ value, scope }: { value?: string | null; scope: string }) {
  return (
    <Field scope={scope} label="Position">
      <select name="position" defaultValue={value ?? ""} className={selectCls}>
        <option value="">Not set</option>
        {Object.entries(POS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Squad for one team + season. Only CLEARED players can be added (enforced
 * in Postgres). A player whose screening later changes stays listed but is
 * flagged ineligible. Removal deactivates the membership (history is kept).
 */
export function SquadEditor({
  squadId,
  members,
  candidates,
  scopeLabel,
}: {
  squadId: string;
  members: SquadMemberRow[];
  candidates: { player_id: string; name: string | null; conflict: string | null }[];
  scopeLabel: string;
}) {
  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);
  const flagged = active.filter((m) => m.eligibility !== "CLEARED");
  return (
    <div>
      {flagged.length > 0 && (
        <p role="alert" className="mb-3 rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm font-semibold text-loss">
          {flagged.length} squad member{flagged.length > 1 ? "s are" : " is"} no longer eligible and cannot be selected for matches.
        </p>
      )}
      {active.length === 0 ? (
        <Empty title="No players in this squad">Add CLEARED players below.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {active.map((m) => (
            <li key={m.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 py-2.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:items-start">
              <span className="font-display text-2xl leading-none font-extrabold tabular-nums">{m.shirt_number}</span>
              <div className="min-w-0">
                <Link href={`/admin/players/${m.player_id}`} className="font-semibold text-brand-700 hover:underline">
                  {m.name ?? `No. ${m.shirt_number}`}
                </Link>
                <span className="mt-1 flex flex-wrap gap-1">
                  {m.position === "GK" ? <Badge tone="brand">GK</Badge> : m.position ? <Badge tone="muted">{m.position}</Badge> : null}
                  {m.captain && <Badge tone="warn">Captain</Badge>}
                  <EligibilityBadge status={m.eligibility} />
                </span>
                <Disclosure summary="Edit">
                  <ActionForm action={updateSquadPlayer}>
                    <input type="hidden" name="id" value={m.id} />
                    <div className="grid gap-3 sm:grid-cols-[6rem_1fr_auto] sm:items-end">
                      <Field scope={m.id} label="Shirt">
                        <input type="number" name="shirt_number" min={1} max={99} required defaultValue={m.shirt_number} className={inputCls} />
                      </Field>
                      <PositionSelect value={m.position} scope={m.id} />
                      <Check name="is_captain" label="Captain" defaultChecked={m.captain} />
                    </div>
                    <Submit className={`${btn.primary} mt-3`}>Save</Submit>
                  </ActionForm>
                </Disclosure>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <ConfirmAction
                  action={setSquadPlayerActive}
                  hidden={{ id: m.id, active: "0" }}
                  trigger="Remove from squad"
                  triggerClass={btn.small}
                  title={`Remove No. ${m.shirt_number} from the ${scopeLabel} squad?`}
                  body="The membership is deactivated (kept in history). Confirmed line-ups of upcoming matches that include this player are reopened."
                  reason={{ label: "Reason (required)", required: true, placeholder: "e.g. Transferred to another team" }}
                  confirmLabel="Remove from squad"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-lg border border-line bg-canvas p-3">
        <h3 className="mb-2 text-sm font-extrabold uppercase">Add a cleared player</h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No CLEARED players are waiting for this squad. Players must be registered and cleared for {scopeLabel} first —{" "}
            <Link href="/admin/screening" className="font-semibold text-brand-700 underline">
              screening queue
            </Link>
            .
          </p>
        ) : (
          <ActionForm action={addSquadPlayer} resetOnSuccess>
            <input type="hidden" name="squad_id" value={squadId} />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_auto] sm:items-end">
              <Field label="Player" scope={squadId}>
                <select name="player_id" required defaultValue="" className={selectCls}>
                  <option value="" disabled>
                    Choose a cleared player
                  </option>
                  {candidates.map((c) => (
                    <option key={c.player_id} value={c.player_id} disabled={!!c.conflict}>
                      {c.name ?? "Unnamed player"}
                      {c.conflict ? ` — already plays for ${c.conflict}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Shirt" scope={squadId}>
                <input type="number" name="shirt_number" min={1} max={99} required className={inputCls} />
              </Field>
              <PositionSelect scope={`${squadId}-new`} />
              <Check name="is_captain" label="Captain" />
            </div>
            <Submit className={`${btn.primary} mt-3`}>Add to squad</Submit>
          </ActionForm>
        )}
      </div>

      {inactive.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-ink-muted">Former members ({inactive.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {inactive.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-8 font-bold tabular-nums">{m.shirt_number}</span>
                <Link href={`/admin/players/${m.player_id}`} className="min-w-0 flex-1 text-brand-700 hover:underline">
                  {m.name ?? "Unnamed player"}
                </Link>
                <span className="text-xs text-ink-muted">{m.left_reason}</span>
                <ConfirmAction
                  action={setSquadPlayerActive}
                  hidden={{ id: m.id, active: "1" }}
                  trigger="Reactivate"
                  triggerClass={btn.small}
                  tone="primary"
                  title={`Reactivate ${m.name ?? `No. ${m.shirt_number}`}?`}
                  body="Only possible while they are CLEARED for this team and season and not in another squad."
                  confirmLabel="Reactivate"
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
