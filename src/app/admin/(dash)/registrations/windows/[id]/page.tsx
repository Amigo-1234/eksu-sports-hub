import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { WindowBadge, WindowFields } from "@/components/admin/Registration";
import { btn, Card, PageTitle } from "@/components/admin/ui";
import { setRegistrationWindowStatus, updateRegistrationWindow } from "@/lib/admin/actions/registrations";
import { listRegistrationWindows } from "@/lib/admin/data/registrations";
import { formatWatDateTime } from "@/lib/admin/time";

export const metadata: Metadata = { title: "Registration window" };

export default async function RegistrationWindowPage({ params, searchParams }: PageProps<"/admin/registrations/windows/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const w = (await listRegistrationWindows()).find((x) => x.id === id);
  if (!w) notFound();
  const total = Object.values(w.counts).reduce((a, b) => a + (b ?? 0), 0);
  const status = (s: "OPEN" | "CLOSED" | "ARCHIVED") => ({ window_id: w.id, status: s });
  return (
    <>
      <PageTitle title={w.title} description={`${w.competition.name} · ${w.season.name}`} back={{ href: "/admin/registrations/windows", label: "Registration windows" }} />
      {typeof sp.notice === "string" && (
        <p role="status" className="mb-4 rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">
          {sp.notice === "created" ? "Window created as a draft. Open it when you are ready to accept registrations." : sp.notice.slice(0, 200)}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Details">
          {w.status === "ARCHIVED" ? (
            <p className="text-sm text-ink-muted">Archived windows cannot be edited.</p>
          ) : (
            <ActionForm action={updateRegistrationWindow} className="space-y-3">
              <input type="hidden" name="window_id" value={w.id} />
              <WindowFields w={w} />
              <Submit className={btn.primary}>Save window</Submit>
            </ActionForm>
          )}
        </Card>
        <Card title="Status" actions={<WindowBadge w={w} />}>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline text-ink-muted">Public link: </dt>
              <dd className="inline font-mono">
                {w.open_now ? (
                  <Link href={`/register/${w.slug}`} className="text-brand-700 underline">
                    /register/{w.slug}
                  </Link>
                ) : (
                  `/register/${w.slug}`
                )}
              </dd>
            </div>
            <div>
              <dt className="inline text-ink-muted">Dates: </dt>
              <dd className="inline">
                {formatWatDateTime(w.opens_at)} → {w.closes_at ? formatWatDateTime(w.closes_at) : "no closing date"}
              </dd>
            </div>
            <div>
              <dt className="inline text-ink-muted">Submissions: </dt>
              <dd className="inline">
                <Link href={`/admin/registrations?window=${w.id}`} className="underline">
                  {total} registration{total === 1 ? "" : "s"}, {w.players} player{w.players === 1 ? "" : "s"}
                </Link>
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {(w.status === "DRAFT" || w.status === "CLOSED") && (
              <ConfirmAction
                action={setRegistrationWindowStatus}
                hidden={status("OPEN")}
                trigger={w.status === "DRAFT" ? "Open registration" : "Reopen registration"}
                triggerClass={btn.primary}
                tone="primary"
                title="Open registration?"
                body={`The public can register for ${w.competition.name} at /register/${w.slug} between the window's dates.`}
                confirmLabel="Open"
              />
            )}
            {w.status === "OPEN" && (
              <ConfirmAction
                action={setRegistrationWindowStatus}
                hidden={status("CLOSED")}
                trigger="Close registration"
                triggerClass={btn.secondary}
                title="Close registration now?"
                body="New submissions stop immediately. Existing registrations stay in the inbox for review."
                confirmLabel="Close"
              />
            )}
            {w.status === "CLOSED" && (
              <ConfirmAction
                action={setRegistrationWindowStatus}
                hidden={status("ARCHIVED")}
                trigger="Archive"
                triggerClass={btn.secondary}
                title="Archive this window?"
                body="It can no longer be edited or reopened. Its registrations remain."
                confirmLabel="Archive"
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
