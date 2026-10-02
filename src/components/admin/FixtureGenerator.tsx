"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { confirmFixturesAction, previewFixturesAction, type FixtureConfig, type FixturePreview } from "@/lib/admin/actions/engine";
import { formatWatDateTime } from "@/lib/admin/time";
import { btn, Field, inputCls, selectCls } from "./ui";

/**
 * Generate → Preview → review matchdays → Confirm. Nothing is stored until
 * Confirm; the server re-computes the preview and refuses if it changed.
 */
export function FixtureGenerator({ stageId, defaultLegs, venues }: { stageId: string; defaultLegs: number; venues: { id: string; name: string }[] }) {
  const router = useRouter();
  const [config, setConfig] = useState<FixtureConfig>({
    start_date: "",
    kickoff_time: "16:00",
    days_between: 7,
    spacing_minutes: 120,
    legs: defaultLegs,
    venue_id: null,
  });
  const [preview, setPreview] = useState<FixturePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof FixtureConfig>(k: K, v: FixtureConfig[K]) => {
    setConfig((c) => ({ ...c, [k]: v }));
    setPreview(null); // a changed setting invalidates the preview
  };

  const byMatchday = useMemo(() => {
    const m = new Map<number, FixturePreview["fixtures"]>();
    for (const f of preview?.fixtures ?? []) m.set(f.matchday, [...(m.get(f.matchday) ?? []), f]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [preview]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field scope={`${stageId}-start`} label="First matchday">
          <input type="date" required value={config.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} />
        </Field>
        <Field scope={`${stageId}-time`} label="Kick-off (WAT)">
          <input type="time" value={config.kickoff_time} onChange={(e) => set("kickoff_time", e.target.value)} className={inputCls} />
        </Field>
        <Field scope={`${stageId}-days`} label="Days between matchdays">
          <input type="number" min={1} max={60} value={config.days_between} onChange={(e) => set("days_between", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field scope={`${stageId}-spacing`} label="Minutes between kick-offs" hint="Same matchday, one pitch">
          <input type="number" min={0} max={720} value={config.spacing_minutes} onChange={(e) => set("spacing_minutes", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field scope={`${stageId}-legs`} label="Round robin">
          <select value={config.legs} onChange={(e) => set("legs", Number(e.target.value))} className={selectCls}>
            <option value={1}>Single (everyone once)</option>
            <option value={2}>Double (home and away)</option>
          </select>
        </Field>
        <Field scope={`${stageId}-venue`} label="Venue">
          <select value={config.venue_id ?? ""} onChange={(e) => set("venue_id", e.target.value || null)} className={selectCls}>
            <option value="">To be confirmed</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !config.start_date}
          className={btn.secondary}
          onClick={() =>
            start(async () => {
              setError(null);
              setDone(null);
              const r = await previewFixturesAction(stageId, config);
              if (r.ok) setPreview(r.data);
              else setError(r.error);
            })
          }
        >
          {pending && !preview ? "Generating…" : "Generate preview"}
        </button>
        {preview && (
          <button
            type="button"
            disabled={pending || preview.issues.length > 0 || preview.match_count === 0 || preview.existing_fixtures > 0}
            className={btn.primary}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await confirmFixturesAction(stageId, config, preview.hash);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setDone(r.data.idempotent ? "These fixtures were already created." : `${r.data.created} fixtures created.`);
                setPreview(null);
                router.refresh();
              })
            }
          >
            Confirm {preview.match_count} fixtures
          </button>
        )}
      </div>
      <div aria-live="polite">
        {error && <p className="rounded-lg border border-live/40 bg-live/10 px-3 py-2 text-sm font-semibold">{error}</p>}
        {done && <p className="rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-sm font-semibold text-win">{done}</p>}
      </div>

      {preview && (
        <section aria-label="Fixture preview" className="space-y-3">
          <p className="text-sm">
            <strong>Preview — not saved.</strong> {preview.match_count} matches over {preview.matchdays} matchdays ({preview.legs === 2 ? "double" : "single"} round robin).
          </p>
          {preview.existing_fixtures > 0 && (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm font-semibold">
              This stage already has {preview.existing_fixtures} fixture(s). The generator never replaces an existing fixture list.
            </p>
          )}
          {preview.issues.map((i) => (
            <p key={i} className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm font-semibold">
              {i}
            </p>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            {byMatchday.map(([md, list]) => (
              <section key={md} className="rounded-lg border border-line p-3" aria-label={`Matchday ${md}`}>
                <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">Matchday {md}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {list.map((f) => (
                    <li key={`${f.home_team_id}-${f.away_team_id}`} className="flex flex-wrap justify-between gap-x-2">
                      <span className="min-w-0 font-semibold break-words">
                        {f.home} v {f.away}
                        {f.group_name && <span className="ml-1 text-xs font-normal text-ink-muted">{f.group_name}</span>}
                      </span>
                      <span className="text-xs text-ink-muted tabular-nums">{formatWatDateTime(f.scheduled_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
