"use client";

import { ActionForm, FormMessage, Submit } from "./ActionForm";
import { ConfirmAction } from "./ConfirmAction";
import { Badge, btn } from "./ui";
import { CopyButton } from "@/components/registration/CopyButton";
import { createPracticeLink, revokePracticeLink } from "@/lib/admin/actions/applications";
import type { PracticeLink } from "@/lib/admin/data/applications";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));

function waLink(phone: string | null, message: string) {
  const digits = phone ? phone.replace(/^\+?0/, "234").replace(/^\+/, "") : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function message(firstName: string, link: string) {
  return `Hi ${firstName}, thanks for applying to be a match operator for EKSU Sports Hub! ⚽

Before we decide, please complete a short practice test (about 12 minutes). You'll officiate a mock match in our real operator console, it's made up and won't appear on the site:

${link}

Use the phone you'd use on match day. At the end, enter your name and submit. The link works once and expires in 14 days.`;
}

/** Practice (skills test) links for one application: create, send, revoke, read the result. */
export function PracticeLinks({
  applicationId,
  firstName,
  phone,
  origin,
  links,
  now,
}: {
  applicationId: string;
  firstName: string;
  phone: string | null;
  origin: string;
  links: PracticeLink[];
  /** Server time (ms) for the expiry check. */
  now: number;
}) {
  return (
    <div className="space-y-4">
      {links.map((l) => {
        const url = `${origin}/practice/${l.token}`;
        const expired = new Date(l.expires_at).getTime() <= now;
        const status = l.submitted_at ? "submitted" : l.revoked_at ? "revoked" : expired ? "expired" : l.opened_at ? "opened" : "sent";
        return (
          <div key={l.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-muted">Created {fmt(l.created_at)}</span>
              {status === "submitted" ? (
                <Badge tone={(l.score ?? 0) >= 80 ? "ok" : (l.score ?? 0) >= 60 ? "warn" : "bad"}>Score {l.score}/100</Badge>
              ) : (
                <Badge tone={status === "opened" ? "brand" : "neutral"}>
                  {{ sent: "Not opened yet", opened: `Opened ${l.opened_at ? fmt(l.opened_at) : ""}`, revoked: "Revoked", expired: "Expired" }[status]}
                </Badge>
              )}
            </div>

            {status === "submitted" && l.result?.items ? (
              <div className="mt-3">
                <p className="text-sm">
                  Submitted by <b>{l.submitted_name}</b> on {l.submitted_at ? fmt(l.submitted_at) : ""}
                  {l.result.avgDelaySeconds != null && <> · average reaction <b>{l.result.avgDelaySeconds}s</b></>}
                </p>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
                  {l.result.items.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 px-2.5 py-1.5">
                      <span>
                        {i.label}
                        {i.note && <span className="block text-xs text-ink-faint">{i.note}</span>}
                      </span>
                      <span className={`shrink-0 font-bold tabular-nums ${i.points === i.max ? "text-win" : i.points === 0 ? "text-loss" : ""}`}>
                        {i.points}/{i.max}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : status === "sent" || status === "opened" ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs break-all text-ink-muted">{url}</p>
                <div className="flex flex-wrap gap-2">
                  <a href={waLink(phone, message(firstName, url))} target="_blank" rel="noopener noreferrer" className={btn.primary}>
                    Send on WhatsApp
                  </a>
                  <CopyButton text={message(firstName, url)} label="Copy message" />
                  <ConfirmAction
                    action={revokePracticeLink}
                    hidden={{ link_id: l.id }}
                    trigger="Revoke"
                    title="Revoke this practice link?"
                    body="The applicant will no longer be able to open or submit it."
                    confirmLabel="Revoke link"
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <ActionForm
        action={createPracticeLink}
        hideMessage
        render={({ state }) => (
          <>
            <input type="hidden" name="id" value={applicationId} />
            <Submit className={`${links.length ? btn.secondary : btn.primary} w-full`} pendingLabel="Creating…">
              {links.length ? "Create another practice link" : "Create practice link"}
            </Submit>
            <FormMessage state={state} />
          </>
        )}
      />
    </div>
  );
}
