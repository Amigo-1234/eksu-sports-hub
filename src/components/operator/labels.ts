import type { OpEventType, PauseReason } from "@/lib/operator/types";

export const EVENT_LABEL: Record<OpEventType, string> = {
  GOAL: "Goal",
  PENALTY_GOAL: "Penalty goal",
  OWN_GOAL: "Own goal",
  YELLOW_CARD: "Yellow card",
  SECOND_YELLOW: "Second yellow",
  RED_CARD: "Red card",
  SUBSTITUTION: "Substitution",
  PENALTY_MISS: "Penalty missed",
};

export const PAUSE_REASONS: { value: PauseReason; label: string }[] = [
  { value: "INJURY", label: "Injury" },
  { value: "WEATHER", label: "Weather" },
  { value: "CROWD", label: "Crowd issue" },
  { value: "TECHNICAL", label: "Technical issue" },
  { value: "OTHER", label: "Other" },
];

export const PAUSE_LABEL = Object.fromEntries(PAUSE_REASONS.map((r) => [r.value, r.label])) as Record<PauseReason, string>;
