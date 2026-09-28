import type { FormResult } from "@/lib/types";

const STYLE = {
  W: "bg-win text-white",
  D: "bg-draw text-white",
  L: "bg-loss text-white",
} as const;

const LABEL = { W: "Win", D: "Draw", L: "Loss" } as const;

/** Recent results as W/D/L pills, oldest → newest. */
export function FormGuide({ form, size = "md" }: { form: FormResult[]; size?: "sm" | "md" }) {
  if (form.length === 0) {
    return <span className="text-xs text-ink-faint">No matches yet</span>;
  }
  const box = size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs";
  return (
    <ol
      className="flex gap-1"
      aria-label={`Form, oldest to newest: ${form.map((f) => LABEL[f.outcome]).join(", ")}`}
    >
      {form.map((f) => (
        <li
          key={f.matchId}
          aria-hidden="true"
          className={`grid ${box} place-items-center rounded font-bold ${STYLE[f.outcome]}`}
        >
          {f.outcome}
        </li>
      ))}
    </ol>
  );
}
