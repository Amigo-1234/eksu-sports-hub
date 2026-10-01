"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { adminCreateRegistration, type AdminPersonInput } from "@/lib/admin/actions/registrations";
import type { IntakeOptions } from "@/lib/admin/data/registrations";
import { ACCEPT, LEVEL_LABEL, LEVELS, normaliseMatric, POSITION_LABEL, POSITIONS, type DocKind } from "@/lib/registration/rules";
import { btn, inputCls, selectCls } from "./ui";

/*
 * Admin-led registration: an administrator enters a player (or a team
 * official's roster) on someone's behalf. It goes through the SAME intake
 * as the public form (admin_create_registration → private.intake_registration):
 * reference, duplicate checks, inbox, history, and Accept for screening.
 * Documents are attached on the registration page afterwards, if available.
 */

const blank = (): AdminPersonInput & { key: string } => ({
  key: Math.random().toString(36).slice(2),
  full_name: "",
  matric_number: "",
  faculty_id: "",
  department_id: null,
  level: "",
  phone: "",
  position: "",
  team_id: null,
});

function L({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

function PersonFields({
  p,
  set,
  faculties,
  phoneLabel,
}: {
  p: AdminPersonInput;
  set: (patch: Partial<AdminPersonInput>) => void;
  faculties: IntakeOptions["faculties"];
  phoneLabel: string;
}) {
  const faculty = faculties.find((f) => f.id === p.faculty_id);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <L label="Full name">
        <input className={inputCls} value={p.full_name} maxLength={80} onChange={(e) => set({ full_name: e.target.value })} autoComplete="off" />
      </L>
      <L label="Matric / student number">
        <input className={inputCls} value={p.matric_number} maxLength={40} onChange={(e) => set({ matric_number: e.target.value })} autoComplete="off" spellCheck={false} />
      </L>
      <L label="Faculty">
        <select className={selectCls} value={p.faculty_id} onChange={(e) => set({ faculty_id: e.target.value, department_id: null })}>
          <option value="">Choose faculty</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </L>
      <L label="Department" hint={faculty && faculty.departments.length === 0 ? "This faculty has no departments recorded." : undefined}>
        <select
          className={selectCls}
          value={p.department_id ?? ""}
          onChange={(e) => set({ department_id: e.target.value || null })}
          disabled={!faculty || faculty.departments.length === 0}
        >
          <option value="">{faculty && faculty.departments.length ? "Choose department" : "—"}</option>
          {faculty?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </L>
      <L label="Level">
        <select className={selectCls} value={p.level} onChange={(e) => set({ level: e.target.value })}>
          <option value="">Choose level</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </L>
      <L label="Position">
        <select className={selectCls} value={p.position} onChange={(e) => set({ position: e.target.value })}>
          <option value="">Choose position</option>
          {POSITIONS.map((x) => (
            <option key={x} value={x}>
              {x} · {POSITION_LABEL[x]}
            </option>
          ))}
        </select>
      </L>
      <L label={phoneLabel}>
        <input className={inputCls} type="tel" inputMode="tel" maxLength={20} value={p.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
      </L>
    </div>
  );
}

export function AdminRegistrationForm({ options, mode }: { options: IntakeOptions; mode: "PLAYER_SELF" | "TEAM_ROSTER" }) {
  const router = useRouter();
  const [windowId, setWindowId] = useState(options.windows[0]?.id ?? "");
  const [teamId, setTeamId] = useState("");
  const [official, setOfficial] = useState({ name: "", phone: "", email: "" });
  const [people, setPeople] = useState([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const win = options.windows.find((w) => w.id === windowId);
  const isTeam = mode === "TEAM_ROSTER";
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    people.forEach((p) => {
      const k = normaliseMatric(p.matric_number);
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    });
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [people]);

  const setPerson = (key: string, patch: Partial<AdminPersonInput>) => setPeople((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!win) return setError("Choose the competition / registration window.");
    if (!teamId) return setError("Choose the team.");
    if (dupes.size) return setError("The same matric number appears more than once.");
    const me = people[0];
    setBusy(true);
    const res = await adminCreateRegistration({
      window_id: win.id,
      type: mode,
      team_id: teamId,
      submitter: isTeam ? { name: official.name, phone: official.phone, email: official.email || null } : { name: me.full_name, phone: me.phone ?? "", email: official.email || null },
      players: people.map((p) => ({
        full_name: p.full_name,
        matric_number: p.matric_number,
        faculty_id: p.faculty_id,
        department_id: p.department_id,
        level: p.level,
        phone: p.phone,
        position: p.position,
        team_id: teamId,
      })),
    }).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/admin/registrations/${res.id}?notice=${encodeURIComponent(`Registration ${res.reference} created. Attach documents if available, then review and accept for screening.`)}`);
  }

  if (options.windows.length === 0) {
    return <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">Create a registration window for the competition first.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <fieldset disabled={busy} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Competition / window" hint={win ? `References: EKSU-${win.reference_code}-…  · window is ${win.status.toLowerCase()}` : undefined}>
            <select
              className={selectCls}
              value={windowId}
              onChange={(e) => {
                setWindowId(e.target.value);
                setTeamId("");
              }}
            >
              {options.windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.competition.name} · {w.season} — {w.title}
                </option>
              ))}
            </select>
          </L>
          <L label={isTeam ? "Team" : "Intended team"}>
            <select className={selectCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Choose team</option>
              {win?.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </L>
        </div>

        {isTeam && (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-bold">Team official (submitter)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <L label="Full name">
                <input className={inputCls} value={official.name} maxLength={80} onChange={(e) => setOfficial({ ...official, name: e.target.value })} />
              </L>
              <L label="Phone" hint="Used with the reference for the public status check.">
                <input className={inputCls} type="tel" inputMode="tel" maxLength={20} value={official.phone} onChange={(e) => setOfficial({ ...official, phone: e.target.value })} />
              </L>
              <L label="Email (optional)">
                <input className={inputCls} type="email" maxLength={120} value={official.email} onChange={(e) => setOfficial({ ...official, email: e.target.value })} />
              </L>
            </div>
          </fieldset>
        )}

        {people.map((p, i) => (
          <fieldset key={p.key} className="rounded-lg border border-line p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-bold">
              {isTeam ? `Player ${i + 1}` : "Player"}
              {dupes.has(normaliseMatric(p.matric_number)) && <span className="text-xs font-bold text-loss">Duplicate matric number</span>}
            </legend>
            <PersonFields
              p={p}
              set={(patch) => setPerson(p.key, patch)}
              faculties={options.faculties}
              phoneLabel={isTeam ? "Phone (optional)" : "Phone (used for the status check)"}
            />
            {isTeam && people.length > 1 && (
              <button type="button" className={`${btn.ghost} mt-2 text-loss`} onClick={() => setPeople((ps) => ps.filter((x) => x.key !== p.key))}>
                Remove player {i + 1}
              </button>
            )}
          </fieldset>
        ))}
        {!isTeam && (
          <L label="Email (optional)">
            <input className={inputCls} type="email" maxLength={120} value={official.email} onChange={(e) => setOfficial({ ...official, email: e.target.value })} />
          </L>
        )}
        {isTeam && people.length < 40 && (
          <button type="button" className={btn.secondary} onClick={() => setPeople((ps) => [...ps, blank()])}>
            + Add player ({people.length} so far)
          </button>
        )}
      </fieldset>
      <div aria-live="polite" className="empty:hidden">
        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm font-semibold text-loss">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btn.primary} disabled={busy}>
          {busy ? "Creating…" : isTeam ? "Create roster registration" : "Create player registration"}
        </button>
        <p className="text-xs text-ink-muted">Creates a SUBMITTED registration only. Nobody is screened, cleared or added to a squad until you accept and screen them.</p>
      </div>
    </form>
  );
}

/** Attach a passport photo / ID evidence to an entry (admin, private storage). */
export function AdminDocumentUpload({ registrationId, personId, kind, has }: { registrationId: string; personId: string; kind: DocKind; has: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = kind === "photo" ? "photo" : "ID evidence";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className={`${btn.small} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Uploading…" : `${has ? "Replace" : "Attach"} ${label}`}
        <input
          type="file"
          accept={ACCEPT[kind]}
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setMsg(null);
            const fd = new FormData();
            fd.set("registration_id", registrationId);
            fd.set("person_id", personId);
            fd.set("kind", kind);
            fd.set("file", file, file.name);
            const res = await fetch("/admin/api/registration-document", { method: "POST", body: fd }).catch(() => null);
            const body = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            setBusy(false);
            if (res?.ok && body?.ok) {
              setMsg({ ok: true, text: "Attached" });
              router.refresh();
            } else setMsg({ ok: false, text: body?.error ?? "Upload failed" });
          }}
        />
      </label>
      {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-win" : "text-loss"}`}>{msg.text}</span>}
    </span>
  );
}
