import type { Competition } from "./types";
import type { ChipOption } from "@/components/ui/FilterChips";

/** Read a single string value from Next.js search params. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** "All" + one chip per competition, as shareable ?competition= links. */
export function competitionChips(
  basePath: string,
  competitions: Competition[],
  selected: string | undefined,
): ChipOption[] {
  return [
    { label: "All", href: basePath, active: !selected },
    ...competitions.map((c) => ({
      label: c.shortName,
      href: `${basePath}?competition=${encodeURIComponent(c.id)}`,
      active: selected === c.id,
    })),
  ];
}
