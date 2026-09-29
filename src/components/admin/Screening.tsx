import { decideScreening } from "@/lib/admin/actions/players";
import type { ScreeningStatus } from "@/lib/admin/data/players";
import { ConfirmAction } from "./ConfirmAction";
import { Badge, btn, inputCls } from "./ui";

const TONE = { PENDING: "warn", CLEARED: "ok", REJECTED: "bad", SUSPENDED: "bad" } as const;
const LABEL: Record<string, string> = {
  PENDING: "Pending",
  CLEARED: "Cleared",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  NOT_SCREENED: "Not screened",
  NOT_IN_SQUAD: "Not in squad",
};

export function ScreeningBadge({ status }: { status: string }) {
  return <Badge tone={TONE[status as ScreeningStatus] ?? "muted"}>{LABEL[status] ?? status}</Badge>;
}

/** Squad/line-up eligibility derived from screening: anything but CLEARED is flagged. */
export function EligibilityBadge({ status }: { status: string }) {
  return status === "CLEARED" ? <Badge tone="ok">Eligible</Badge> : <Badge tone="bad">Ineligible · {(LABEL[status] ?? status).toLowerCase()}</Badge>;
}

function DateAndNotes() {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Screening date (optional)</span>
        <input type="date" name="screened_on" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Notes (optional, private)</span>
        <textarea name="notes" rows={2} maxLength={500} className={`${inputCls} h-auto py-2`} />
      </label>
    </>
  );
}

/**
 * CLEAR / REJECT / SUSPEND / RETURN TO PENDING. Every decision asks for
 * confirmation; REJECT and SUSPEND require a reason. Decisions are appended
 * to the screening history and audited in Postgres.
 */
export function ScreeningActions({
  id,
  status,
  player,
  scope,
  returnTo,
}: {
  id: string;
  status: ScreeningStatus;
  player: string;
  scope: string;
  /** Queue URL to return to (the decided row leaves the list). */
  returnTo?: string;
}) {
  const hidden = (s: ScreeningStatus) => ({ screening_id: id, status: s, player_name: player, ...(returnTo ? { return_to: returnTo } : {}) });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "CLEARED" && (
        <ConfirmAction
          action={decideScreening}
          hidden={hidden("CLEARED")}
          trigger="Clear"
          triggerClass={`${btn.small} border-win/50 text-win`}
          tone="primary"
          title={`Clear ${player}?`}
          body={`${player} becomes eligible for the ${scope} squad and match line-ups.`}
          confirmLabel="Clear player"
        >
          <DateAndNotes />
        </ConfirmAction>
      )}
      {status !== "REJECTED" && (
        <ConfirmAction
          action={decideScreening}
          hidden={hidden("REJECTED")}
          trigger="Reject"
          triggerClass={btn.small}
          title={`Reject ${player}?`}
          body={`${player} failed screening for ${scope} and cannot join the squad or a line-up.`}
          reason={{ label: "Reason (required, private)", required: true, placeholder: "e.g. Not a registered EKSU student" }}
          confirmLabel="Reject player"
        >
          <DateAndNotes />
        </ConfirmAction>
      )}
      {status !== "SUSPENDED" && (
        <ConfirmAction
          action={decideScreening}
          hidden={hidden("SUSPENDED")}
          trigger="Suspend"
          triggerClass={btn.small}
          title={`Suspend ${player}?`}
          body="Eligibility ends immediately. Their squad membership is flagged, and any confirmed line-up of an upcoming match that includes them is reopened as a draft."
          reason={{ label: "Reason (required, private)", required: true, placeholder: "e.g. Two-match ban for violent conduct" }}
          confirmLabel="Suspend player"
        />
      )}
      {status !== "PENDING" && (
        <ConfirmAction
          action={decideScreening}
          hidden={hidden("PENDING")}
          trigger="Return to pending"
          triggerClass={btn.small}
          tone="primary"
          title={`Return ${player} to pending?`}
          body={status === "CLEARED" ? "This reverses a clearance: the player is no longer eligible until cleared again." : "The player will be screened again."}
          reason={{ label: "Reason (optional)", placeholder: "e.g. Documents resubmitted" }}
          confirmLabel="Return to pending"
        />
      )}
    </div>
  );
}
