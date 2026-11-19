"use client";

import { StarIcon } from "@/components/ui/icons";
import { toggleMyTeam, useIsStarred } from "./my-teams";

/** ★ Add a team to My Teams (this browser), shown first on the home page. */
export function MyTeamStar({ teamId, teamName, compact = false }: { teamId: string; teamName: string; compact?: boolean }) {
  const on = useIsStarred(teamId);
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => toggleMyTeam(teamId)}
        aria-pressed={on}
        aria-label={on ? `Remove ${teamName} from My Teams` : `Add ${teamName} to My Teams`}
        className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-subtle ${on ? "text-accent-500" : "text-ink-faint"}`}
      >
        <StarIcon size={20} filled={on} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => toggleMyTeam(teamId)}
      aria-pressed={on}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition-colors ${
        on ? "border-accent-400 bg-accent-100 text-ink" : "border-line bg-surface text-ink hover:bg-subtle"
      }`}
    >
      <StarIcon size={17} filled={on} className={on ? "text-accent-500" : ""} />
      {on ? "My team" : "Add to My Teams"}
    </button>
  );
}
