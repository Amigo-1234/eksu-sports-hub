"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startDraft, submitRegistration, type SubmitResult } from "@/app/(public)/register/actions";
import type { PublicWindowDetail } from "@/lib/registration/public";
import { LEVEL_LABEL, POSITION_LABEL, cleanPhone, isEmail, normaliseMatric, type RegistrationType } from "@/lib/registration/rules";
import { CopyButton } from "./CopyButton";
import { emptyPerson, personErrors, PersonSection, TextField, type Errors, type Person, type Section } from "./PersonFields";
import { SearchSelect } from "./SearchSelect";

/*
 * The public registration form, as a step-by-step wizard (mobile first).
 *
 *   Player:  Competition → Personal → Academic → Football → Documents → Review
 *   Team:    Team → Your details → Players (add / edit / remove) → Review
 *
 * Answers are kept in this browser (localStorage) so a refresh or a dropped
 * connection loses nothing. Documents upload as they are chosen, through our
 * server, into private storage. Submitting creates a registration REQUEST
 * only: the Sports Directorate reviews and screens every player.
 */

interface Draft {
  v: 1;
  registrationId: string | null;
  token: string | null;
  teamId: string;
  submitter: { name: string; phone: string; email: string };
  people: Person[];
  step: number;
}

const PLAYER_STEPS = ["Competition", "Personal", "Academic", "Football", "Documents", "Review"] as const;
const TEAM_STEPS = ["Team", "Your details", "Players", "Review"] as const;
const SECTION_OF: Record<string, Section | undefined> = { Personal: "personal", Academic: "academic", Football: "football", Documents: "documents" };
const ALL_SECTIONS: Section[] = ["personal", "academic", "football", "documents"];

const freshDraft = (mode: RegistrationType): Draft => ({
  v: 1,
  registrationId: null,
  token: null,
  teamId: "",
  submitter: { name: "", phone: "", email: "" },
  people: mode === "PLAYER_SELF" ? [emptyPerson()] : [],
  step: 0,
});

function loadDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && d.v === 1 && Array.isArray(d.people) ? d : null;
  } catch {
    return null;
  }
}

export function RegistrationWizard({ mode, window: w }: { mode: RegistrationType; window: PublicWindowDetail }) {
  const storageKey = `eksu-registration:${w.id}:${mode}`;
  const steps: readonly string[] = mode === "PLAYER_SELF" ? PLAYER_STEPS : TEAM_STEPS;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [personErr, setPersonErr] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Restore saved answers after hydration (the server render has no access to them).
  useEffect(() => {
    const saved = loadDraft(storageKey);
    queueMicrotask(() => setDraft(saved ?? freshDraft(mode)));
  }, [storageKey, mode]);
  useEffect(() => {
    if (!draft || done) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Private browsing / storage full: the form still works, it just won't survive a reload.
    }
  }, [draft, done, storageKey]);

  const update = useCallback((patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setDraft((d) => (d ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d));
  }, []);

  /** Draft token for uploads (created on first need). */
  const getToken = useCallback(async (): Promise<string | null> => {
    const d = draftRef.current;
    if (d?.token) return d.token;
    const r = await startDraft(w.id);
    if (!r.ok) {
      setNotice(r.error);
      return null;
    }
    update({ registrationId: r.registrationId, token: r.token });
    draftRef.current = d ? { ...d, registrationId: r.registrationId, token: r.token } : d;
    return r.token;
  }, [w.id, update]);

  const teamOptions = useMemo(() => w.teams.map((t) => ({ value: t.id, label: t.name, hint: t.short_name !== t.name ? t.short_name : undefined })), [w.teams]);
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of draft?.people ?? []) {
      const k = normaliseMatric(p.matric_number);
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [draft?.people]);

  if (!draft) {
    return <div className="mt-6 h-64 animate-pulse rounded-card bg-subtle" aria-busy="true" aria-label="Loading form" />;
  }

  const step = Math.min(draft.step, steps.length - 1);
  const stepName = steps[step];
  const person = draft.people[0];
  const team = w.teams.find((t) => t.id === draft.teamId);
  const isPlayer = mode === "PLAYER_SELF";

  const goTo = (n: number) => {
    update({ step: n });
    setErrors({});
    setPersonErr({});
    setNotice(null);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  /** Validate the current step; true when the user may continue. */
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (stepName === "Competition" || stepName === "Team") {
      if (!team) e.team = "Choose the team.";
    }
    if (stepName === "Your details") {
      if (draft!.submitter.name.trim().length < 2) e.name = "Enter your full name.";
      if (!/^\+?[0-9]{10,15}$/.test(cleanPhone(draft!.submitter.phone))) e.phone = "Enter a valid phone number, e.g. 08031234567.";
    }
    if ((stepName === "Personal" || stepName === "Your details") && draft!.submitter.email.trim() && !isEmail(draft!.submitter.email.trim())) {
      e.email = "Enter a valid email address, or leave it empty.";
    }
    if (stepName === "Players") {
      if (draft!.people.length === 0) e.players = "Add at least one player.";
      else if (draft!.people.some((p) => Object.keys(personErrors(p, w.faculties, ALL_SECTIONS)).length > 0)) e.players = "Some players are incomplete. Edit them to finish.";
      else if (duplicateKeys.size > 0) e.players = "The same matric number appears more than once. Remove or correct the duplicate.";
      if (editing) e.players = "Save or cancel the player you are editing first.";
    }
    const section = SECTION_OF[stepName];
    let pe: Errors = {};
    if (isPlayer && section) pe = personErrors(person, w.faculties, [section], { phoneRequired: true });
    setErrors(e);
    setPersonErr(pe);
    const ok = Object.keys(e).length === 0 && Object.keys(pe).length === 0;
    if (!ok) requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
    return ok;
  }

  async function submit() {
    if (!confirmed) {
      setErrors({ confirm: "Confirm that the details are correct." });
      return;
    }
    const d = draftRef.current!;
    // Last full check (also catches answers restored from an older draft).
    const bad = d.people.findIndex((p) => Object.keys(personErrors(p, w.faculties, ALL_SECTIONS, { phoneRequired: isPlayer })).length > 0);
    if (!team || bad >= 0 || !d.token) {
      setNotice(bad >= 0 ? `${isPlayer ? "Your details are" : `Player ${bad + 1} is`} incomplete. Go back and finish ${isPlayer ? "them" : "it"}.` : "Some answers are missing. Go back and check each step.");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const submitter = isPlayer
      ? { name: person.full_name.trim(), phone: cleanPhone(person.phone), email: d.submitter.email.trim() || null }
      : { name: d.submitter.name.trim(), phone: cleanPhone(d.submitter.phone), email: d.submitter.email.trim() || null };
    const res = await submitRegistration({
      token: d.token,
      type: mode,
      team_id: d.teamId,
      submitter,
      players: d.people.map((p) => ({
        id: p.id,
        full_name: p.full_name.trim(),
        matric_number: p.matric_number.trim(),
        faculty_id: p.faculty_id,
        department_id: p.department_id || null,
        level: p.level,
        phone: p.phone ? cleanPhone(p.phone) : null,
        position: p.position,
        team_id: d.teamId,
        photo_path: p.photo?.path ?? null,
        id_path: p.idDoc?.path ?? null,
      })),
    }).catch(() => ({ ok: false as const, error: "Could not reach the server. Check your connection and try again." }));
    setSubmitting(false);
    if (res.ok) {
      setDone(res);
      try {
        window.localStorage.removeItem(storageKey);
      } catch {}
      requestAnimationFrame(() => headingRef.current?.focus());
      return;
    }
    if ("expired" in res && res.expired) {
      // New draft id → documents must be uploaded again under it.
      update((x) => ({ token: null, registrationId: null, people: x.people.map((p) => ({ ...p, photo: null, idDoc: null })) }));
      goTo(isPlayer ? steps.indexOf("Documents") : steps.indexOf("Players"));
      setNotice("Your form expired, so the documents need to be uploaded again. Everything else is saved.");
      return;
    }
    setNotice(res.error);
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <div className="rounded-card border border-win/40 bg-surface p-5 text-center">
          <p className="text-xs font-bold tracking-wide text-win uppercase">Registration submitted</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 font-display text-2xl font-extrabold outline-none">
            Keep this reference
          </h1>
          <p className="mt-3 font-mono text-2xl font-bold tracking-wider break-all sm:text-3xl" aria-label={`Reference ${done.reference.split("").join(" ")}`}>
            {done.reference}
          </p>
          <div className="mt-3 flex justify-center">
            <CopyButton text={done.reference} />
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            {done.competition} · {done.players} player{done.players === 1 ? "" : "s"}
          </p>
          <p className="mt-4 rounded-lg border border-accent-300 bg-accent-100 px-3 py-2 text-left text-sm">
            Your registration does not mean you have been cleared to participate. The Sports Directorate must screen and approve your registration.
          </p>
          <div className="mt-5 grid gap-2 sm:flex sm:justify-center">
            <Link href="/register/status" className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800">
              Check status later
            </Link>
            <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-5 text-sm font-bold hover:bg-subtle">
              Back to registration
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-muted">To check your status you will need this reference and the phone number you entered.</p>
        </div>
      </div>
    );
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  const setPerson = (patch: Partial<Person>) => update((d) => ({ people: d.people.map((p, i) => (i === 0 ? { ...p, ...patch } : p)) }));

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <div className="pt-4 pb-3 sm:pt-6">
        <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">
          {w.competition.short_name} · {w.season.name}
        </p>
        <p className="font-display text-lg leading-tight font-extrabold">{isPlayer ? "Register as a player" : "Register a team"}</p>
      </div>

      <nav aria-label="Progress" className="mb-4">
        <p className="mb-1.5 text-sm font-semibold text-ink-muted">
          Step {step + 1} of {steps.length}
          <span className="sr-only">: {stepName}</span>
        </p>
        <ol className="flex gap-1">
          {steps.map((s, i) => (
            <li key={s} className="min-w-0 flex-1">
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-brand-700" : "bg-line"}`} aria-hidden="true" />
              <span className={`mt-1 hidden truncate text-[11px] font-semibold sm:block ${i === step ? "text-ink" : "text-ink-faint"}`} aria-current={i === step ? "step" : undefined}>
                {s}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <section className="rounded-card border border-line bg-surface p-4 sm:p-5" aria-labelledby="step-title">
        <h1 id="step-title" ref={headingRef} tabIndex={-1} className="mb-4 font-display text-2xl leading-tight font-extrabold outline-none">
          {stepName}
        </h1>

        {(stepName === "Competition" || stepName === "Team") && (
          <div className="space-y-4">
            <div className="rounded-lg bg-subtle px-3 py-2.5 text-sm">
              <p className="font-bold">{w.competition.name}</p>
              <p className="text-ink-muted">{w.title}</p>
            </div>
            {w.instructions && <p className="text-sm whitespace-pre-line text-ink-muted">{w.instructions}</p>}
            <SearchSelect
              id="reg-team"
              label={isPlayer ? "Team you will play for" : "Your team"}
              required
              options={teamOptions}
              value={draft.teamId}
              onChange={(v) => update({ teamId: v })}
              placeholder="Search teams"
              error={errors.team}
            />
            {isPlayer && <p className="text-xs text-ink-muted">For faculty competitions this is usually your faculty&apos;s team.</p>}
          </div>
        )}

        {stepName === "Your details" && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">The captain or team manager sending this roster. We contact you about the registration.</p>
            <TextField
              id="sub-name"
              label="Your full name"
              required
              value={draft.submitter.name}
              onChange={(v) => update((d) => ({ submitter: { ...d.submitter, name: v } }))}
              error={errors.name}
              autoComplete="name"
              maxLength={80}
            />
            <TextField
              id="sub-phone"
              label="Phone number"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="08031234567"
              value={draft.submitter.phone}
              onChange={(v) => update((d) => ({ submitter: { ...d.submitter, phone: v } }))}
              error={errors.phone}
            />
            <TextField
              id="sub-email"
              label="Email (optional)"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              value={draft.submitter.email}
              onChange={(v) => update((d) => ({ submitter: { ...d.submitter, email: v } }))}
              error={errors.email}
            />
          </div>
        )}

        {isPlayer && SECTION_OF[stepName] && (
          <div className="space-y-4">
            <PersonSection
              section={SECTION_OF[stepName]!}
              person={person}
              set={setPerson}
              errors={personErr}
              faculties={w.faculties}
              getToken={getToken}
              phoneRequired
              idPrefix="me"
            />
            {stepName === "Personal" && (
              <TextField
                id="me-email"
                label="Email (optional)"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={120}
                value={draft.submitter.email}
                onChange={(v) => update((d) => ({ submitter: { ...d.submitter, email: v } }))}
                error={errors.email}
              />
            )}
          </div>
        )}

        {stepName === "Players" && (
          <RosterEditor
            people={draft.people}
            editing={editing}
            setEditing={setEditing}
            duplicateKeys={duplicateKeys}
            faculties={w.faculties}
            getToken={getToken}
            onSave={(p) =>
              update((d) => ({ people: d.people.some((x) => x.id === p.id) ? d.people.map((x) => (x.id === p.id ? p : x)) : [...d.people, p] }))
            }
            onRemove={(id) => update((d) => ({ people: d.people.filter((x) => x.id !== id) }))}
            error={errors.players}
          />
        )}

        {stepName === "Review" && (
          <Review
            mode={mode}
            draft={draft}
            team={team?.name ?? "—"}
            competition={w.competition.name}
            faculties={w.faculties}
            onEdit={(s) => goTo(steps.indexOf(s))}
            duplicateKeys={duplicateKeys}
          />
        )}

        {stepName === "Review" && (
          <label className="mt-5 flex min-h-12 items-start gap-3 rounded-lg border border-line-strong p-3">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-700" aria-invalid={errors.confirm ? true : undefined} />
            <span className="text-sm">
              I confirm these details are true. I understand that registering does not make {isPlayer ? "me" : "any player"} eligible until the Sports Directorate has
              screened and cleared {isPlayer ? "me" : "them"}.
              {errors.confirm && <span className="mt-1 block font-semibold text-loss">{errors.confirm}</span>}
            </span>
          </label>
        )}

        <div aria-live="polite" className="empty:hidden">
          {notice && (
            <p role="alert" className="mt-4 rounded-lg border border-loss/40 bg-live-soft px-3 py-2 text-sm font-semibold text-loss">
              {notice}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => goTo(step - 1)} className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-5 text-sm font-bold hover:bg-subtle">
              Back
            </button>
          ) : (
            <Link href={`/register/${w.slug}`} className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-5 text-sm font-bold hover:bg-subtle">
              Cancel
            </Link>
          )}
          {stepName === "Review" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-700 px-6 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit registration"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => validate() && goTo(step + 1)}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-700 px-6 text-sm font-bold text-white hover:bg-brand-800"
            >
              Continue
            </button>
          )}
        </div>
      </section>
      <p className="mt-3 text-center text-xs text-ink-muted">Your answers are saved on this device until you submit.</p>
    </div>
  );
}

// ── Team roster ───────────────────────────────────────────────────────────────
function RosterEditor({
  people,
  editing,
  setEditing,
  duplicateKeys,
  faculties,
  getToken,
  onSave,
  onRemove,
  error,
}: {
  people: Person[];
  editing: Person | null;
  setEditing: (p: Person | null) => void;
  duplicateKeys: Set<string>;
  faculties: PublicWindowDetail["faculties"];
  getToken: () => Promise<string | null>;
  onSave: (p: Person) => void;
  onRemove: (id: string) => void;
  error?: string;
}) {
  const [errs, setErrs] = useState<Errors>({});
  const complete = people.filter((p) => Object.keys(personErrors(p, faculties, ALL_SECTIONS)).length === 0).length;
  const isNew = editing ? !people.some((p) => p.id === editing.id) : false;

  if (editing) {
    const set = (patch: Partial<Person>) => setEditing({ ...editing, ...patch });
    const dupe = (() => {
      const k = normaliseMatric(editing.matric_number);
      return k !== "" && people.some((p) => p.id !== editing.id && normaliseMatric(p.matric_number) === k);
    })();
    return (
      <div className="space-y-5">
        <p className="text-sm font-bold">{isNew ? `Player ${people.length + 1}` : `Editing ${editing.full_name || "player"}`}</p>
        {(["personal", "academic", "football", "documents"] as Section[]).map((s) => (
          <fieldset key={s} className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
            <legend className="mb-2 text-xs font-bold tracking-wide text-ink-faint uppercase">{s === "football" ? "Football" : s[0].toUpperCase() + s.slice(1)}</legend>
            <PersonSection section={s} person={editing} set={set} errors={errs} faculties={faculties} getToken={getToken} idPrefix={`p-${editing.id.slice(0, 8)}`} />
          </fieldset>
        ))}
        {dupe && (
          <p role="alert" className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
            This matric number is already in your roster.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setEditing(null)} className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-5 text-sm font-bold hover:bg-subtle">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const e = personErrors(editing, faculties, ALL_SECTIONS);
              setErrs(e);
              if (Object.keys(e).length > 0 || dupe) {
                requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
                return;
              }
              onSave({ ...editing, full_name: editing.full_name.trim(), phone: cleanPhone(editing.phone) });
              setEditing(null);
              setErrs({});
            }}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800"
          >
            Save player
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-ink-muted" aria-live="polite">
        {people.length} player{people.length === 1 ? "" : "s"} · {complete} complete
      </p>
      {people.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
          {people.map((p, i) => {
            const incomplete = Object.keys(personErrors(p, faculties, ALL_SECTIONS)).length > 0;
            const dup = duplicateKeys.has(normaliseMatric(p.matric_number));
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="w-6 shrink-0 text-xs font-bold text-ink-faint tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.full_name || "Unnamed player"}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {p.matric_number || "No matric number"}
                    {p.position ? ` · ${p.position}` : ""}
                  </span>
                  {incomplete && <span className="text-xs font-bold text-warn">Incomplete</span>}
                  {dup && <span className="ml-2 text-xs font-bold text-loss">Duplicate matric number</span>}
                </span>
                <button type="button" onClick={() => setEditing(p)} className="inline-flex h-11 items-center rounded-md border border-line-strong px-3 text-sm font-bold hover:bg-subtle">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove ${p.full_name || "this player"} from the roster?`)) onRemove(p.id);
                  }}
                  className="inline-flex h-11 items-center rounded-md px-3 text-sm font-bold text-loss hover:bg-live-soft"
                  aria-label={`Remove ${p.full_name || `player ${i + 1}`}`}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {people.length < 40 ? (
        <button
          type="button"
          onClick={() => setEditing(emptyPerson())}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg border-2 border-dashed border-brand-300 text-sm font-bold text-brand-700 hover:bg-brand-50"
        >
          + Add player
        </button>
      ) : (
        <p className="text-sm text-ink-muted">A roster can have at most 40 players.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-loss">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Review ────────────────────────────────────────────────────────────────────
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 py-1.5 text-sm">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-semibold break-words">{v || "—"}</dd>
    </div>
  );
}

function EditLink({ to, onEdit }: { to: string; onEdit: (step: string) => void }) {
  return (
    <button type="button" onClick={() => onEdit(to)} className="inline-flex h-9 items-center rounded-md px-2 text-sm font-bold text-brand-700 hover:bg-brand-50">
      Edit<span className="sr-only"> {to}</span>
    </button>
  );
}

function Review({
  mode,
  draft,
  team,
  competition,
  faculties,
  onEdit,
  duplicateKeys,
}: {
  mode: RegistrationType;
  draft: Draft;
  team: string;
  competition: string;
  faculties: PublicWindowDetail["faculties"];
  onEdit: (step: string) => void;
  duplicateKeys: Set<string>;
}) {
  const org = (p: Person) => {
    const f = faculties.find((x) => x.id === p.faculty_id);
    const d = f?.departments.find((x) => x.id === p.department_id);
    return [d?.name, f?.name].filter(Boolean).join(", ");
  };
  if (mode === "PLAYER_SELF") {
    const p = draft.people[0];
    return (
      <div className="space-y-4">
        {(
          [
            ["Competition", [["Competition", competition], ["Team", team]]],
            ["Personal", [["Name", p.full_name], ["Phone", p.phone], ["Email", draft.submitter.email]]],
            ["Academic", [["Matric no.", p.matric_number], ["Faculty", org(p)], ["Level", LEVEL_LABEL[p.level as keyof typeof LEVEL_LABEL] ?? ""]]],
            ["Football", [["Position", POSITION_LABEL[p.position as keyof typeof POSITION_LABEL] ?? ""]]],
            ["Documents", [["Photo", p.photo ? "Uploaded" : "Missing"], ["ID evidence", p.idDoc ? "Uploaded" : "Missing"]]],
          ] as [string, [string, string][]][]
        ).map(([title, rows]) => (
          <div key={title} className="rounded-lg border border-line px-3 py-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wide text-ink-faint uppercase">{title}</h2>
              <EditLink onEdit={onEdit} to={title} />
            </div>
            <dl>
              {rows.map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wide text-ink-faint uppercase">Team</h2>
          <EditLink onEdit={onEdit} to="Team" />
        </div>
        <dl>
          <Row k="Competition" v={competition} />
          <Row k="Team" v={team} />
        </dl>
      </div>
      <div className="rounded-lg border border-line px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wide text-ink-faint uppercase">Submitted by</h2>
          <EditLink onEdit={onEdit} to="Your details" />
        </div>
        <dl>
          <Row k="Name" v={draft.submitter.name} />
          <Row k="Phone" v={draft.submitter.phone} />
          <Row k="Email" v={draft.submitter.email} />
        </dl>
      </div>
      <div className="rounded-lg border border-line px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wide text-ink-faint uppercase">Players ({draft.people.length})</h2>
          <EditLink onEdit={onEdit} to="Players" />
        </div>
        <ol className="divide-y divide-line">
          {draft.people.map((p, i) => (
            <li key={p.id} className="py-2 text-sm">
              <span className="font-semibold">
                {i + 1}. {p.full_name}
              </span>
              <span className="block text-xs text-ink-muted">
                {p.matric_number} · {org(p)} · {LEVEL_LABEL[p.level as keyof typeof LEVEL_LABEL] ?? p.level} · {p.position}
                {p.photo && p.idDoc ? " · documents uploaded" : " · documents missing"}
              </span>
              {duplicateKeys.has(normaliseMatric(p.matric_number)) && <span className="text-xs font-bold text-loss">Duplicate matric number</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
