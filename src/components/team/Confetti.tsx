/** Decorative confetti burst (pure CSS; hidden for reduced motion). */
const COLORS = ["#761530", "#a8284a", "#f5b700", "#16a34a", "#2563eb", "#f97316"];

export function Confetti({ count = 42 }: { count?: number }) {
  // Deterministic layout so server and client render the same pieces.
  const pieces = Array.from({ length: count }, (_, i) => {
    const r = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280;
    return {
      left: `${Math.round(r(1) * 100)}%`,
      delay: `${(r(2) * 1.6).toFixed(2)}s`,
      duration: `${(2.6 + r(3) * 2.2).toFixed(2)}s`,
      drift: `${Math.round((r(4) - 0.5) * 160)}px`,
      spin: `${Math.round(360 + r(5) * 540)}deg`,
      size: 6 + Math.round(r(6) * 6),
      round: r(7) > 0.6,
      color: COLORS[i % COLORS.length],
    };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.round ? p.size : p.size * 1.6,
              borderRadius: p.round ? "9999px" : "2px",
              background: p.color,
              animation: `wl-fall ${p.duration} cubic-bezier(.2,.6,.4,1) ${p.delay} both`,
              "--wl-drift": p.drift,
              "--wl-spin": p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
