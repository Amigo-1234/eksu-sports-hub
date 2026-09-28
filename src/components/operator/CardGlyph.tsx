/** Card shape with a letter, so yellow vs red never relies on colour alone. */
export function CardGlyph({ kind, size = 36 }: { kind: "YELLOW" | "RED" | "SECOND_YELLOW"; size?: number }) {
  const card = (fill: string, letter: string, x = 0, rotate = 0) => (
    <g transform={`translate(${x} 0) rotate(${rotate} 12 16)`}>
      <rect x="4" y="2" width="16" height="24" rx="2.5" className={fill} stroke="currentColor" strokeOpacity=".35" />
      <text x="12" y="18.5" textAnchor="middle" fontSize="11" fontWeight="900" className={letter === "R" ? "fill-white" : "fill-ink"}>
        {letter}
      </text>
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={kind === "SECOND_YELLOW" ? "0 0 34 30" : "0 0 24 30"} aria-hidden="true">
      {kind === "YELLOW" && card("fill-accent-400", "Y")}
      {kind === "RED" && card("fill-live", "R")}
      {kind === "SECOND_YELLOW" && (
        <>
          {card("fill-accent-400", "Y", 0, -8)}
          {card("fill-live", "2Y", 10, 6)}
        </>
      )}
    </svg>
  );
}
