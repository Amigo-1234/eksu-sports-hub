import type { Team } from "@/lib/types";

const SIZES = {
  xs: 18,
  sm: 24,
  md: 32,
  lg: 52,
  xl: 68,
} as const;

export type CrestSize = keyof typeof SIZES;

/**
 * Placeholder crest built from the team's colours and code. Swap the inner
 * SVG for an <Image> once official crests exist — the API stays the same.
 */
export function TeamCrest({
  team,
  size = "md",
  className = "",
}: {
  team: Pick<Team, "code" | "colors" | "name">;
  size?: CrestSize;
  className?: string;
}) {
  const px = SIZES[size];
  const fontSize = team.code.length > 3 ? 10 : 12.5;
  return (
    <svg
      width={px}
      height={Math.round(px * 1.1)}
      viewBox="0 0 40 44"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 1.5 37 6.5v14.2c0 10-7 17.6-17 21.8C10 38.3 3 30.7 3 20.7V6.5L20 1.5Z"
        fill={team.colors.primary}
      />
      <path
        d="M20 4.6 34 8.8v11.9c0 8.5-5.9 15-14 18.7-8.1-3.7-14-10.2-14-18.7V8.8l14-4.2Z"
        fill="none"
        stroke={team.colors.secondary}
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />
      <text
        x="20"
        y="25.5"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="var(--font-display)"
        letterSpacing="0.3"
        fill={team.colors.secondary}
      >
        {team.code}
      </text>
    </svg>
  );
}
