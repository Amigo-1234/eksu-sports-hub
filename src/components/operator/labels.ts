import type { OpEvent, OpEventType, PauseReason } from "@/lib/operator/types";
import type { SpecialRules } from "@/lib/rules/special";

export const EVENT_LABEL: Record<OpEventType, string> = {
  GOAL: "Goal",
  PENALTY_GOAL: "Penalty goal",
  OWN_GOAL: "Own goal",
  YELLOW_CARD: "Yellow card",
  SECOND_YELLOW: "Second yellow",
  RED_CARD: "Red card",
  SUBSTITUTION: "Substitution",
  PENALTY_MISS: "Penalty missed",
  SUSPENSION_RETURN: "Returned after suspension",
  EXCLUSION: "Excluded (permanent)",
};

/** Event label under the match's rules: a temporary red card says so. */
export function eventLabel(e: Pick<OpEvent, "type">, rules: SpecialRules | null | undefined): string {
  const secs = rules?.redCardSuspensionSeconds;
  if (secs && (e.type === "RED_CARD" || e.type === "SECOND_YELLOW")) return `${EVENT_LABEL[e.type]} · ${secs} s suspension`;
  return EVENT_LABEL[e.type];
}

export const PAUSE_REASONS: { value: PauseReason; label: string }[] = [
  { value: "INJURY", label: "Injury" },
  { value: "WEATHER", label: "Weather" },
  { value: "CROWD", label: "Crowd issue" },
  { value: "TECHNICAL", label: "Technical issue" },
  { value: "OTHER", label: "Other" },
];

export const PAUSE_LABEL = Object.fromEntries(PAUSE_REASONS.map((r) => [r.value, r.label])) as Record<PauseReason, string>;
