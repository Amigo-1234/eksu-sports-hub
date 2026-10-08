"use client";

import { specialRulesAction } from "@/lib/admin/actions/competitions";
import { parseRegulations, parseSpecialRules, ruleFacts } from "@/lib/rules/special";
import { ActionForm } from "./ActionForm";
import { btn } from "./ui";

/**
 * Special competition rules (isolated from normal football). Off by default.
 * The six-a-side novelty preset adds six-player line-ups, rolling
 * substitutions, 60-second temporary red cards, no added time, a one-minute
 * half-time and the public Rules & Regulations page. Matches already played
 * keep the rules they were played under.
 */
export function SpecialRulesForm({ competitionId, rules }: { competitionId: string; rules: Record<string, unknown> | null | undefined }) {
  const parsed = parseSpecialRules(rules);
  const regulations = parseRegulations(rules);
  return (
    <ActionForm action={specialRulesAction} className="space-y-3">
      <input type="hidden" name="competition_id" value={competitionId} />
      {parsed ? (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label="Rules in force">
            {ruleFacts(parsed).map((f) => (
              <li key={f} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{f}</li>
            ))}
          </ul>
          {regulations && <p className="text-xs text-ink-muted">{regulations.items.length} regulations are shown on the public Rules page.</p>}
        </>
      ) : (
        <p className="text-sm text-ink-muted">Normal football rules.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!parsed && (
          <button type="submit" name="mode" value="six_a_side_novelty" className={btn.primary}>
            Apply six-a-side novelty rules
          </button>
        )}
        {parsed && (
          <button type="submit" name="mode" value="off" className={btn.secondary}>
            Switch special rules off
          </button>
        )}
      </div>
      <p className="text-xs text-ink-muted">Set the match length separately (2 × 8:00 for the novelty format). Audited.</p>
    </ActionForm>
  );
}
