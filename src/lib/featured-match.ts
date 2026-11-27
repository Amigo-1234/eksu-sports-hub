/**
 * Homepage featured-match banner. One match at a time; set to null to hide.
 * The banner shows from now until `hideAfterHours` after kick-off (or once the
 * match is finished and that window has passed).
 */
export interface FeaturedMatchConfig {
  matchId: string;
  /** Kicker line above the teams, e.g. "EKSU Galacticos — Representing EKSU". */
  kicker: string;
  /** Optional news story id (/news/<id>) for the "Read the preview" link. */
  storyId?: string;
  hideAfterHours: number;
}

export const FEATURED_MATCH: FeaturedMatchConfig | null = {
  matchId: "697df93b-5cd8-4be1-bc69-9130c7c0b52e", // F8 Ballers FC v EKSU Galacticos FC, NLO Cup, Sat 28 Nov 2026 11:00
  kicker: "EKSU Galacticos — Representing EKSU",
  storyId: "eksu-galacticos-v-f8-ballers-nlo-cup-preview",
  hideAfterHours: 6,
};

/** Whether the banner should still show at `now` for a match kicking off at `kickoffAt`. */
export function featuredMatchVisible(kickoffAt: string, now: number, hideAfterHours: number): boolean {
  return now < Date.parse(kickoffAt) + hideAfterHours * 3_600_000;
}
