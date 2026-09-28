import type { Competition } from "./types";

/**
 * Table zone markers per competition. Presentation rules — a backend could
 * later serve these as competition settings.
 */
const PROMOTION: Record<string, { spots: number; label: string }> = {
  "ifc-2026": { spots: 2, label: "Qualifies for the championship final" },
  "ifw-2026": { spots: 1, label: "Champions" },
};

export function promotionFor(c: Competition) {
  return PROMOTION[c.id];
}
