import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ScreeningBadge } from "@/components/admin/Screening";
import { btn, Card, Empty, Field, inputCls, PageTitle, selectCls } from "@/components/admin/ui";
import { registerPlayer } from "@/lib/admin/actions/players";
import { listCompetitionOptions } from "@/lib/admin/data/competitions";
import { listPlayers } from "@/lib/admin/data/players";
import { listFaculties, listSeasons } from "@/lib/admin/data/reference";
import { listTeamRefs } from "@/lib/admin/data/teams";

export const metadata: Metadata = { title: "Players" };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The player register. A registered player is not yet eligible: they need a
 * CLEARED screening for a team + season, then a squad place, then selection
 * in a match line-up.
 */
export default async function PlayersPage({ searchParams }: PageProps<"/admin/players">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const uuid = (k: string) => (UUID.test(str(k)) ? str(k) : undefined);
  const [teams, seasons, faculties, competitions] = await Promise.all([listTeamRefs(), listSeasons(), listFaculties(), listCompetitionOptions()]);
  const filters = { name: str("name") || undefined, student: str("student") || undefined, team: uuid("team"), season: uuid("season"), faculty: uuid("faculty") };
  const players = await listPlayers(filters);
  const current = seasons.find((s) => s.is_current);

  return (
    <>
      <PageTitle
        title="Players"
        description="Registered players. Registration opens a pending screening; only CLEARED players can join a squad and be selected for matches."
        actions={
          <Link href="/admin/screening" className={btn.secondary}>
            Screening queue
          </Link>
        }
      />

      <div className="mb-4 grid gap-2 text-sm sm:grid-cols-4" aria-label="From registration to the pitch">
        {[
          ["1 · Registered", "Name + private student number"],
          ["2 · Screened", "CLEARED for a team and season"],
          ["3 · Squad", "Shirt number in the season squad"],
          ["4 · Line-up", "Picked for a specific match"],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-line bg-surface px-3 py-2">
            <p className="font-extrabold uppercase">{t}</p>
            <p className="text-xs text-ink-muted">{d}</p>
          </div>
        ))}
      </div>

      <Card title="Register a player" id="register" className="mb-6" description="The student number is private: only administrators can see it. It must be unique.">
        <ActionForm action={registerPlayer} resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Player name">
              <input name="display_name" required maxLength={80} className={inputCls} autoComplete="off" />
            </Field>
            <Field label="Student / matric number" hint="Private. Used to prevent duplicate registrations.">
              <input name="student_id" required maxLength={40} className={inputCls} autoComplete="off" />
            </Field>
            <Field label="Department (optional)">
              <select name="department_id" defaultValue="" className={selectCls}>
                <option value="">Not recorded</option>
                {faculties.map((f) => (
                  <optgroup key={f.id} label={f.name}>
                    {f.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Faculty (optional)" hint="Filled from the department when left blank.">
              <select name="faculty_id" defaultValue="" className={selectCls}>
                <option value="">From department / not recorded</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team">
              <select name="team_id" required defaultValue="" className={selectCls}>
                <option value="" disabled>
                  Choose a team
                </option>
                {teams
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Season">
              <select name="season_id" required defaultValue={current?.id ?? ""} className={selectCls}>
                {seasons
                  .filter((s) => !s.archived_at)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.is_current ? " (current)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Competition (optional)" hint="Leave blank: the screening covers the whole season.">
              <select name="competition_id" defaultValue="" className={selectCls}>
                <option value="">Whole season</option>
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.season}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes (optional, private)" className="sm:col-span-2">
              <input name="notes" maxLength={500} className={inputCls} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Submit className={btn.primary}>Register player</Submit>
            <button name="another" value="1" className={btn.secondary}>
              Register and add another
            </button>
          </div>
        </ActionForm>
      </Card>

      <Card title={`Registered players · ${players.length}${players.length >= 200 ? "+" : ""}`}>
        <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Name">
            <input name="name" defaultValue={filters.name} className={inputCls} />
          </Field>
          <Field label="Student number">
            <input name="student" defaultValue={filters.student} className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Team">
            <select name="team" defaultValue={filters.team ?? ""} className={selectCls}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Season">
            <select name="season" defaultValue={filters.season ?? ""} className={selectCls}>
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button className={btn.secondary}>Search</button>
            <Link href="/admin/players" className={btn.ghost}>
              Reset
            </Link>
          </div>
        </form>
        {players.length === 0 ? (
          <Empty title="No players registered yet">Register a player above; they appear in the screening queue as pending.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {players.map((p) => (
              <li key={p.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center">
                <div className="min-w-0">
                  <Link href={`/admin/players/${p.id}`} className="font-bold text-brand-700 hover:underline">
                    {p.name ?? "Unnamed player"}
                  </Link>
                  <p className="font-mono text-xs break-all text-ink-muted">{p.student_id ?? "No student number"}</p>
                </div>
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs">
                  {p.screenings.length === 0 && <span className="text-ink-muted">No screening</span>}
                  {p.screenings.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1">
                      <ScreeningBadge status={s.status} />
                      {s.team} · {s.season}
                      {s.competition ? ` · ${s.competition}` : ""}
                    </span>
                  ))}
                  {p.squads.map((q) => (
                    <span key={`${q.team}-${q.season}`} className="inline-flex items-center gap-1 font-semibold">
                      Squad: {q.team} #{q.shirt_number}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
