import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { WindowBadge, WindowFields } from "@/components/admin/Registration";
import { btn, Card, Empty, Field, PageTitle, selectCls } from "@/components/admin/ui";
import { createRegistrationWindow } from "@/lib/admin/actions/registrations";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { listRegistrationWindows } from "@/lib/admin/data/registrations";
import { formatWatDateTime } from "@/lib/admin/time";
import { STATUS_LABEL, type RegistrationStatus } from "@/lib/registration/rules";

export const metadata: Metadata = { title: "Registration windows" };

/** Registration windows: when (and for which competition) the public may register. */
export default async function RegistrationWindowsPage() {
  const [windows, competitions] = await Promise.all([listRegistrationWindows(), listCompetitionOptions()]);
  const usable = competitions.filter((c) => c.status !== "ARCHIVED");
  return (
    <>
      <PageTitle
        title="Registration windows"
        description="Each window opens public registration for one competition. Only OPEN windows inside their dates accept submissions."
        back={{ href: "/admin/registrations", label: "Registrations" }}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={`Windows · ${windows.length}`}>
          {windows.length === 0 ? (
            <Empty title="No registration windows yet">Create one to open public registration for a competition.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {windows.map((w) => {
                const total = Object.values(w.counts).reduce((a, b) => a + (b ?? 0), 0);
                return (
                  <li key={w.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/registrations/windows/${w.id}`} className="font-bold text-brand-700 hover:underline">
                        {w.title}
                      </Link>
                      <WindowBadge w={w} />
                    </div>
                    <p className="text-xs text-ink-muted">
                      {w.competition.name} · {w.season.name} · /register/{w.slug} · {w.reference_code}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatWatDateTime(w.opens_at)} → {w.closes_at ? formatWatDateTime(w.closes_at) : "no closing date"} ·{" "}
                      {[w.allow_player && "players", w.allow_team && "teams"].filter(Boolean).join(" + ")}
                    </p>
                    <p className="mt-1 text-xs">
                      <Link href={`/admin/registrations?window=${w.id}`} className="font-semibold underline-offset-2 hover:underline">
                        {total} registration{total === 1 ? "" : "s"} · {w.players} player{w.players === 1 ? "" : "s"}
                      </Link>
                      {Object.entries(w.counts).map(([s, n]) => (
                        <span key={s} className="ml-2 text-ink-muted">
                          {STATUS_LABEL[s as RegistrationStatus]} {n}
                        </span>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="New window" description="Created as a draft; open it when ready." id="new">
          <ActionForm action={createRegistrationWindow} className="space-y-3">
            <Field label="Competition">
              <select name="competition_id" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Choose competition
                </option>
                {usable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.season}
                  </option>
                ))}
              </select>
            </Field>
            <WindowFields />
            <Submit className={btn.primary}>Create window</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
