"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmKnockoutAction, previewKnockoutAction, type KnockoutConfig, type KnockoutPreview } from "@/lib/admin/actions/engine";
import { btn, Field, selectCls } from "./ui";

/** Bracket generation: pairing rule → preview of every round → confirm. */
export function KnockoutGenerator({ stageId, hasGroups, hasThirdPlace }: { stageId: string; hasGroups: boolean; hasThirdPlace: boolean }) {
  const router = useRouter();
  const [config, setConfig] = useState<KnockoutConfig>({
    pairing: hasGroups ? "CROSS_GROUPS" : "SEEDED",
    avoid_same_group: true,
    third_place: hasThirdPlace,
  });
  const [preview, setPreview] = useState<KnockoutPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof KnockoutConfig>(k: K, v: KnockoutConfig[K]) => {
    setConfig((c) => ({ ...c, [k]: v }));
    setPreview(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field scope={`${stageId}-pairing`} label="Pairing">
          <select value={config.pairing} onChange={(e) => set("pairing", e.target.value as KnockoutConfig["pairing"])} className={selectCls}>
            {hasGroups && <option value="CROSS_GROUPS">Cross groups (A1 v B2, B1 v A2…)</option>}
            <option value="SEEDED">Seeded (1 v N, 2 v N−1…)</option>
          </select>
        </Field>
        {config.pairing === "SEEDED" && hasGroups && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input type="checkbox" checked={config.avoid_same_group} onChange={(e) => set("avoid_same_group", e.target.checked)} className="size-5 accent-brand-700" />
            Avoid same-group pairs in the first round
          </label>
        )}
        {hasThirdPlace && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input type="checkbox" checked={config.third_place} onChange={(e) => set("third_place", e.target.checked)} className="size-5 accent-brand-700" />
            Third-place match
          </label>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        Cross-group pairing can be generated before the groups finish: slots show “Winner Group A” until the group is complete. Seeded pairing needs final qualification.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={btn.secondary}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await previewKnockoutAction(stageId, config);
              if (r.ok) setPreview(r.data);
              else setError(r.error);
            })
          }
        >
          Preview bracket
        </button>
        {preview && (
          <button
            type="button"
            disabled={pending || preview.existing_ties > 0}
            className={btn.primary}
            onClick={() =>
              start(async () => {
                const r = await confirmKnockoutAction(stageId, config, preview.hash);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setPreview(null);
                router.refresh();
              })
            }
          >
            Confirm bracket
          </button>
        )}
      </div>
      <div aria-live="polite">{error && <p className="rounded-lg border border-live/40 bg-live/10 px-3 py-2 text-sm font-semibold">{error}</p>}</div>
      {preview && (
        <section aria-label="Bracket preview" className="space-y-2">
          <p className="text-sm">
            <strong>Preview — not saved.</strong> {preview.qualifiers} teams · {preview.pairing === "CROSS_GROUPS" ? "cross-group" : "seeded"} pairing
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {preview.stages.map((s) => (
              <section key={s.stage_id} className="rounded-lg border border-line p-3" aria-label={s.name}>
                <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">{s.name}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {s.ties.map((t) => (
                    <li key={t.code}>
                      <span className="font-bold">{t.code}</span> {t.home.label} <span className="text-ink-muted">v</span> {t.away.label}
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
