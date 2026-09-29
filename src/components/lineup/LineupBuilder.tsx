"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  assign,
  changeFormation,
  counts,
  draftFromState,
  draftProblems,
  ELIGIBILITY_LABEL,
  formationOf,
  sameDraft,
  slotOccupants,
  toPayload,
  type EditorSquadMember,
  type LineupActions,
  type LineupDraft,
  type LineupEditorState,
  type LineupResult,
} from "@/lib/lineup";
import { PitchFrame, PitchSpot, PlayerMarker } from "./Pitch";

const field = "h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-ink disabled:bg-subtle";
const button = {
  primary: "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50",
  go: "inline-flex min-h-11 items-center justify-center rounded-lg bg-win px-4 text-sm font-bold text-white disabled:opacity-50",
  secondary: "inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-bold text-ink hover:bg-subtle disabled:opacity-50",
};

type Member = EditorSquadMember & { inSquad: boolean };

function eligibilityTone(e: string) {
  return e === "CLEARED" ? "" : e === "SUSPENDED" || e === "REJECTED" ? "border-loss/40 bg-live-soft text-loss" : "border-warn/40 bg-warn-soft text-warn";
}

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded border px-1.5 text-[11px] font-extrabold tracking-wide whitespace-nowrap uppercase ${className}`}>
      {children}
    </span>
  );
}

/**
 * Line-up editor for one team of one match. Used by the admin dashboard
 * and the operator console (different `actions`). Works without drag and
 * drop: every choice is a native control.
 */
export function LineupBuilder({ initial, actions }: { initial: LineupEditorState; actions: LineupActions }) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState<LineupDraft>(() => draftFromState(initial));
  const [saved, setSaved] = useState<LineupDraft>(() => draftFromState(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [slotPicker, setSlotPicker] = useState<number | null>(null);
  const uid = useId();

  const lineup = state.lineup;
  const confirmed = lineup?.status === "CONFIRMED";
  const editing = (state.editable && !confirmed) || correcting;
  const dirty = !sameDraft(draft, saved);
  const formation = formationOf(state.formations, draft.formation);
  const occupants = slotOccupants(draft);
  const c = counts(draft);
  const problems = editing ? draftProblems(draft, state) : (lineup?.problems ?? []);

  // Everyone who can appear: squad members + anyone already in the line-up.
  const members: Member[] = useMemo(() => {
    const list: Member[] = state.squad.map((s) => ({ ...s, inSquad: true }));
    for (const p of lineup?.players ?? []) {
      if (!list.some((m) => m.player_id === p.player_id)) {
        list.push({ player_id: p.player_id, name: p.name, shirt_number: p.shirt_number, position: null, captain: false, eligibility: p.eligibility, inSquad: false });
      }
    }
    return list.sort((a, b) => a.shirt_number - b.shirt_number);
  }, [state.squad, lineup]);
  const byId = new Map(members.map((m) => [m.player_id, m]));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const apply = (r: LineupResult, ok: string) => {
    if (!r.ok) {
      setFeedback({ tone: "error", text: r.error });
      return false;
    }
    setState(r.state);
    const d = draftFromState(r.state);
    setDraft(d);
    setSaved(d);
    setFeedback({ tone: "ok", text: ok });
    return true;
  };

  const run = async (label: string, fn: () => Promise<boolean>) => {
    setBusy(label);
    setFeedback(null);
    try {
      await fn();
    } catch {
      setFeedback({ tone: "error", text: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  const save = () => run("save", async () => apply(await actions.save(draft.formation, toPayload(draft)), "Draft saved. It is not public until confirmed."));
  const confirm = () =>
    run("confirm", async () => {
      if (dirty && !apply(await actions.save(draft.formation, toPayload(draft)), "Draft saved.")) return false;
      const ok = apply(await actions.confirm(), "Line-up confirmed and published.");
      setConfirming(false);
      return ok;
    });
  const reopen = () =>
    run("reopen", async () => {
      const ok = apply(await actions.reopen(reason), "Line-up reopened as a draft. It is no longer public.");
      if (ok) setReason("");
      return ok;
    });
  const correct = () =>
    run("correct", async () => {
      if (!actions.correct) return false;
      const ok = apply(await actions.correct(draft.formation, toPayload(draft), reason), "Correction saved and audited.");
      if (ok) {
        setReason("");
        setCorrecting(false);
      }
      return ok;
    });

  const selectValue = (id: string) => {
    const p = draft.picks[id];
    if (!p) return "none";
    if (p.role === "SUBSTITUTE") return "sub";
    return p.slot === null ? "start" : `slot:${p.slot}`;
  };
  const onSelect = (id: string, v: string) => {
    if (v === "none") setDraft((d) => assign(d, id, null));
    else if (v === "sub") setDraft((d) => assign(d, id, { role: "SUBSTITUTE", slot: null }));
    else if (v === "start") setDraft((d) => assign(d, id, { role: "STARTER", slot: null }));
    else setDraft((d) => assign(d, id, { role: "STARTER", slot: Number(v.slice(5)) }));
  };

  const starters = members.filter((m) => draft.picks[m.player_id]?.role === "STARTER");
  const subs = members.filter((m) => draft.picks[m.player_id]?.role === "SUBSTITUTE");
  const canConfirm = !dirty ? (lineup?.confirm_problems.length ?? 1) === 0 && problems.length === 0 : problems.length === 0;
  const colors = { primary: state.team.color_primary, secondary: state.team.color_secondary };
  const statusText = correcting ? "Correcting" : confirmed ? "Confirmed · public" : lineup ? "Draft · not public" : "Not started";

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Chip className={confirmed && !correcting ? "border-win/40 bg-win/10 text-win" : "border-line-strong bg-subtle text-ink"}>{statusText}</Chip>
        {lineup?.confirmed_at && confirmed && (
          <span className="text-xs text-ink-muted">
            Confirmed {new Date(lineup.confirmed_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}
            {lineup.confirmed_by ? ` by ${lineup.confirmed_by}` : ""}
          </span>
        )}
        {dirty && <Chip className="border-warn/40 bg-warn-soft text-warn">Unsaved changes</Chip>}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* Pitch */}
        <section aria-labelledby={`${uid}-pitch`} className="min-w-0">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 id={`${uid}-pitch`} className="font-display text-lg font-extrabold uppercase">
              Starting XI
            </h2>
            <label className="flex items-center gap-2 text-sm font-bold">
              Formation
              <select
                className={`${field} w-32`}
                value={draft.formation ?? ""}
                disabled={!editing}
                onChange={(e) => {
                  const f = formationOf(state.formations, e.target.value);
                  setDraft((d) => changeFormation(d, e.target.value || null, f?.slots.length ?? 0));
                }}
              >
                {state.formations.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PitchFrame label={`${state.team.name} starting positions`}>
            {(formation?.slots ?? []).map((slot, i) => {
              const id = occupants.get(i);
              const m = id ? byId.get(id) : undefined;
              const content = m ? (
                <PlayerMarker
                  colors={colors}
                  player={{ shirt: m.shirt_number, name: m.name, x: slot.x, y: slot.y, position: slot.position, captain: draft.captain === m.player_id, goalkeeper: slot.position === "GK" }}
                />
              ) : (
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border-2 border-dashed border-white/80 text-[10px] font-extrabold text-white sm:size-9">
                  {slot.position}
                </span>
              );
              return (
                <PitchSpot key={i} x={slot.x} y={slot.y}>
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => setSlotPicker(i)}
                      className="flex max-w-full flex-col items-center rounded-lg p-0.5 focus-visible:outline-accent-400"
                      aria-label={`${slot.position} position: ${m ? `No. ${m.shirt_number} ${m.name ?? ""}` : "empty"}. Choose player`}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </PitchSpot>
              );
            })}
          </PitchFrame>
          <p className="mt-2 text-center text-xs text-ink-muted">
            {editing ? "Tap a position to choose a player, or use the squad list." : "Attacking upwards."}
          </p>
        </section>

        {/* Selection */}
        <section aria-labelledby={`${uid}-squad`} className="min-w-0">
          <div
            role="status"
            className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-3 text-sm sm:grid-cols-4"
          >
            <p>
              <span className="block text-xs text-ink-muted">Starters</span>
              <strong className={c.starters > state.rules.max_starters ? "text-loss" : ""}>
                {c.starters}/{state.rules.max_starters}
              </strong>
            </p>
            <p>
              <span className="block text-xs text-ink-muted">Substitutes</span>
              <strong className={c.substitutes > state.rules.max_substitutes ? "text-loss" : ""}>
                {c.substitutes}/{state.rules.max_substitutes}
              </strong>
            </p>
            <p>
              <span className="block text-xs text-ink-muted">Goalkeeper</span>
              <strong>{[...occupants.entries()].some(([i]) => formation?.slots[i]?.position === "GK") ? "✓ Chosen" : "— None"}</strong>
            </p>
            <p className="min-w-0">
              <span className="block text-xs text-ink-muted">Captain</span>
              <strong className="block truncate">{draft.captain ? `No. ${byId.get(draft.captain)?.shirt_number}` : "—"}</strong>
            </p>
          </div>

          {problems.length > 0 && (
            <div className="mb-3 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">
              <p className="font-bold text-warn">{confirmed && !editing ? "Needs attention" : "Before this line-up can be confirmed:"}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {editing && (
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-bold">Captain (must start)</span>
              <select className={field} value={draft.captain ?? ""} onChange={(e) => setDraft((d) => ({ ...d, captain: e.target.value || null }))}>
                <option value="">No captain chosen</option>
                {starters.map((m) => (
                  <option key={m.player_id} value={m.player_id}>
                    No. {m.shirt_number} {m.name ?? ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <h2 id={`${uid}-squad`} className="mb-2 font-display text-lg font-extrabold uppercase">
            {editing ? "Squad" : "Selected"}
          </h2>
          {editing ? (
            members.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-muted">
                No eligible squad players. Players must be screened, CLEARED and added to the {state.team.short_name} squad first.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {members.map((m) => {
                  const eligible = m.eligibility === "CLEARED";
                  const picked = !!draft.picks[m.player_id];
                  return (
                    <li key={m.player_id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_12rem]">
                      <span className="font-display text-xl font-extrabold tabular-nums">{m.shirt_number}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{m.name ?? `No. ${m.shirt_number}`}</span>
                        <span className="flex flex-wrap gap-1">
                          {m.position && <Chip className="border-line bg-surface text-ink-muted">{m.position}</Chip>}
                          {!eligible && <Chip className={eligibilityTone(m.eligibility)}>{ELIGIBILITY_LABEL[m.eligibility]}</Chip>}
                          {!m.inSquad && <Chip className="border-loss/40 bg-live-soft text-loss">Left squad</Chip>}
                        </span>
                      </span>
                      <select
                        aria-label={`Selection for No. ${m.shirt_number} ${m.name ?? ""}`}
                        className={`${field} col-span-2 sm:col-span-1`}
                        value={selectValue(m.player_id)}
                        disabled={!eligible && !picked && !correcting}
                        onChange={(e) => onSelect(m.player_id, e.target.value)}
                      >
                        <option value="none">Not selected</option>
                        <option value="sub">Substitute</option>
                        <option value="start">Starter (no position yet)</option>
                        {(formation?.slots ?? []).map((s, i) => {
                          const holder = occupants.get(i);
                          const other = holder && holder !== m.player_id ? byId.get(holder) : null;
                          return (
                            <option key={i} value={`slot:${i}`}>
                              Starter · {s.position}
                              {other ? ` (replaces No. ${other.shirt_number})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <SelectedList starters={starters} subs={subs} captain={draft.captain} lineup={state.lineup} />
          )}
        </section>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 z-10 mt-5 rounded-t-lg border border-b-0 border-line bg-surface/95 p-3 backdrop-blur">
        <p role="status" aria-live="polite" className="empty:hidden mb-2">
          {feedback && (
            <span className={`block rounded-lg px-3 py-2 text-sm font-semibold ${feedback.tone === "ok" ? "bg-win/10 text-win" : "bg-live-soft text-loss"}`}>
              {feedback.text}
            </span>
          )}
        </p>
        {editing && !correcting && (
          confirming ? (
            <div className="rounded-lg border-2 border-ink p-3">
              <p className="text-sm font-bold">Confirm and publish this line-up?</p>
              <p className="mt-0.5 text-xs text-ink-muted">It appears on the public match page immediately. Changes afterwards need it to be reopened (audited).</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={button.go} disabled={busy !== null} onClick={confirm}>
                  {busy === "confirm" ? "Confirming…" : "Yes, confirm line-up"}
                </button>
                <button type="button" className={button.secondary} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button.primary} disabled={busy !== null || !dirty} onClick={save}>
                {busy === "save" ? "Saving…" : dirty || !lineup ? "Save draft" : "Draft saved"}
              </button>
              <button
                type="button"
                className={button.go}
                disabled={busy !== null || !canConfirm}
                onClick={() => setConfirming(true)}
                title={canConfirm ? undefined : "Fix the problems listed above first"}
              >
                Confirm line-up
              </button>
            </div>
          )
        )}
        {confirmed && state.editable && !correcting && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-sm font-bold">Reason to reopen</span>
              <input className={field} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Late change: No. 7 injured in warm-up" />
            </label>
            <button type="button" className={button.secondary} disabled={busy !== null || !reason.trim()} onClick={reopen}>
              {busy === "reopen" ? "Reopening…" : "Reopen to edit"}
            </button>
          </div>
        )}
        {!state.editable && !correcting && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-ink-muted">
              The match has started: this line-up is part of the match record.
              {actions.correct ? "" : " Corrections need an administrator."}
            </p>
            {actions.correct && (
              <button type="button" className={button.secondary} onClick={() => { setCorrecting(true); setFeedback(null); }}>
                Correct line-up
              </button>
            )}
          </div>
        )}
        {correcting && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-sm font-bold">Correction reason (audited)</span>
              <input className={field} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Referee report lists No. 9 as captain" />
            </label>
            <button type="button" className={button.primary} disabled={busy !== null || !reason.trim() || problems.some((p) => !p.includes("not eligible"))} onClick={correct}>
              {busy === "correct" ? "Saving…" : "Save correction"}
            </button>
            <button type="button" className={button.secondary} onClick={() => { setCorrecting(false); setDraft(saved); }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <SlotPicker
        open={slotPicker !== null}
        onClose={() => setSlotPicker(null)}
        title={slotPicker !== null && formation ? `${formation.slots[slotPicker]?.position} position` : ""}
        members={members.filter((m) => m.eligibility === "CLEARED" || correcting)}
        current={slotPicker !== null ? (occupants.get(slotPicker) ?? null) : null}
        draft={draft}
        onPick={(id) => {
          if (slotPicker === null) return;
          if (id) setDraft((d) => assign(d, id, { role: "STARTER", slot: slotPicker }));
          else {
            const cur = occupants.get(slotPicker);
            if (cur) setDraft((d) => assign(d, cur, { role: "STARTER", slot: null }));
          }
          setSlotPicker(null);
        }}
      />
    </div>
  );
}

function SelectedList({
  starters,
  subs,
  captain,
  lineup,
}: {
  starters: Member[];
  subs: Member[];
  captain: string | null;
  lineup: LineupEditorState["lineup"];
}) {
  if (!lineup || (starters.length === 0 && subs.length === 0)) {
    return <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-muted">No line-up has been prepared.</p>;
  }
  const state = new Map(lineup.players.map((p) => [p.player_id, p]));
  const row = (m: Member) => {
    const s = state.get(m.player_id);
    return (
      <li key={m.player_id} className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="w-7 font-display text-lg font-extrabold tabular-nums">{m.shirt_number}</span>
        <span className="min-w-0 flex-1 truncate">{m.name ?? `No. ${m.shirt_number}`}</span>
        {s?.position && <Chip className="border-line bg-surface text-ink-muted">{s.position}</Chip>}
        {captain === m.player_id && <Chip className="border-ink bg-ink text-white">C</Chip>}
        {s?.eligibility && s.eligibility !== "CLEARED" && <Chip className={eligibilityTone(s.eligibility)}>{ELIGIBILITY_LABEL[s.eligibility]}</Chip>}
        {s?.sent_off && <Chip className="border-loss/40 bg-live-soft text-loss">Sent off</Chip>}
        {s?.subbed_off && <Chip className="border-line bg-surface text-ink-muted">↓ Off</Chip>}
        {s?.subbed_on && <Chip className="border-win/40 bg-win/10 text-win">↑ On</Chip>}
      </li>
    );
  };
  return (
    <div className="space-y-3">
      <ul aria-label="Starting XI" className="divide-y divide-line rounded-lg border border-line bg-surface">
        {starters.map(row)}
      </ul>
      <h3 className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">Substitutes</h3>
      {subs.length === 0 ? (
        <p className="text-sm text-ink-muted">None named.</p>
      ) : (
        <ul aria-label="Substitutes" className="divide-y divide-line rounded-lg border border-line bg-surface">
          {subs.map(row)}
        </ul>
      )}
    </div>
  );
}

/** Accessible picker (native dialog) for one pitch position. */
function SlotPicker({
  open,
  onClose,
  title,
  members,
  current,
  draft,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  members: Member[];
  current: string | null;
  draft: LineupDraft;
  onPick: (playerId: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const where = (id: string) => {
    const p = draft.picks[id];
    if (!p) return null;
    return p.role === "SUBSTITUTE" ? "Substitute" : p.slot === null ? "Starter, no position" : "Starter";
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50"
    >
      {open && (
        <div className="p-4">
          <h2 id={titleId} className="font-display text-xl font-extrabold uppercase">
            {title}
          </h2>
          <p className="text-xs text-ink-muted">Choose who plays here. A player already placed elsewhere moves to this position.</p>
          <ul className="mt-3 max-h-[55vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {members.map((m) => (
              <li key={m.player_id}>
                <button
                  type="button"
                  aria-pressed={current === m.player_id}
                  onClick={() => onPick(m.player_id)}
                  className={`flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm hover:bg-subtle ${current === m.player_id ? "bg-brand-50 font-bold" : ""}`}
                >
                  <span className="w-7 font-display text-lg font-extrabold tabular-nums">{m.shirt_number}</span>
                  <span className="min-w-0 flex-1 truncate">{m.name ?? `No. ${m.shirt_number}`}</span>
                  {m.position && <span className="text-xs text-ink-muted">{m.position}</span>}
                  {where(m.player_id) && <span className="text-xs text-ink-faint">{where(m.player_id)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {current && (
              <button type="button" className={button.secondary} onClick={() => onPick(null)}>
                Leave position empty
              </button>
            )}
            <button type="button" className={button.secondary} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
