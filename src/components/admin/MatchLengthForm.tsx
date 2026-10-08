"use client";

import { useState } from "react";
import { matchDurationAction } from "@/lib/admin/actions/competitions";
import { formatDuration } from "@/lib/operator/clock";
import { ActionForm, Submit } from "./ActionForm";
import { btn, Field, inputCls } from "./ui";

const PRESETS = [
  { key: "standard", label: "Standard", half: 2700, hint: "2 × 45:00" },
  { key: "short", label: "Short format", half: 450, hint: "2 × 7:30" },
] as const;

/** "7:30" / "7.5" → seconds (NaN when not parseable). */
function toSeconds(raw: string): number {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(raw.trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d{1,2}(\.\d+)?$/.test(raw.trim()) ? Math.round(Number(raw) * 60) : NaN;
}

/**
 * Match length of a competition: the half length drives the operator clock,
 * the half-time and full-time points and the accepted event minutes. Locked
 * once a match has kicked off (an override needs a reason).
 */
export function MatchLengthForm({
  competitionId,
  halfSeconds,
  etHalfSeconds,
  locked,
  noAddedTime = false,
  halftimeSeconds = null,
}: {
  competitionId: string;
  halfSeconds: number;
  etHalfSeconds: number;
  locked: boolean;
  /** Special rules: no added time / a timed half-time break. */
  noAddedTime?: boolean;
  halftimeSeconds?: number | null;
}) {
  const [half, setHalf] = useState(formatDuration(halfSeconds));
  const [etHalf, setEtHalf] = useState(formatDuration(etHalfSeconds));
  const h = toSeconds(half);
  const valid = Number.isFinite(h) && h >= 60 && h <= 3600 && h % 30 === 0;
  const lastMinute = (s: number) => Math.ceil(s / 60);

  return (
    <ActionForm action={matchDurationAction} className="space-y-4">
      <input type="hidden" name="competition_id" value={competitionId} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setHalf(formatDuration(p.half));
              if (p.key === "standard") setEtHalf("15:00");
            }}
            aria-pressed={h === p.half}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${
              h === p.half ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface"
            }`}
          >
            <span className="block font-bold">{p.label}</span>
            <span className="text-xs opacity-80">{p.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Each half" hint="Minutes, e.g. 7:30 or 7.5 (steps of 30 s)">
          <input name="half" value={half} onChange={(e) => setHalf(e.target.value)} required inputMode="decimal" className={inputCls} />
        </Field>
        <Field label="Each extra-time half" hint="Only used in knockout ties that go to extra time">
          <input name="et_half" value={etHalf} onChange={(e) => setEtHalf(e.target.value)} required inputMode="decimal" className={inputCls} />
        </Field>
      </div>
      <div aria-live="polite" className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm">
        {valid ? (
          <>
            <p className="font-bold">
              2 × {formatDuration(h)} · half-time at {formatDuration(h)} · full time at {formatDuration(2 * h)}
            </p>
            <p className="text-xs text-ink-muted">
              The operator clock runs in seconds. The public sees minute labels: 1st half 1&apos;–{lastMinute(h)}&apos;, 2nd half {Math.floor(h / 60) + 1}&apos;–
              {lastMinute(2 * h)}&apos;
              {noAddedTime ? ". No added time: each half ends at its regulation time." : `, added time as ${lastMinute(2 * h)}+1'.`}{" "}
              {halftimeSeconds
                ? `Half-time break: ${formatDuration(halftimeSeconds)} (the operator restarts play).`
                : "Half-time lasts as long as the operator needs."}
            </p>
          </>
        ) : (
          <p className="text-warn">Enter a half length between 1:00 and 60:00 in steps of 30 seconds.</p>
        )}
      </div>
      {locked && (
        <Field label="Reason for changing a started competition" hint="Matches already kicked off keep their own length. Audited.">
          <input name="reason" required maxLength={300} className={inputCls} />
        </Field>
      )}
      <Submit className={btn.primary}>Save match length</Submit>
    </ActionForm>
  );
}
