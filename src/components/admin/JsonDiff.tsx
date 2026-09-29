/** Human-readable before/after diff of audit snapshots (read-only). */

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

const HIDDEN = new Set(["updated_at"]);

export function diffEntries(before: unknown, after: unknown): { key: string; before: string; after: string; changed: boolean }[] {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  if (!isObj(before) && !isObj(after)) {
    if (before === undefined && after === undefined) return [];
    return [{ key: "value", before: fmt(before), after: fmt(after), changed: fmt(before) !== fmt(after) }];
  }
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !HIDDEN.has(k));
  return keys
    .map((key) => ({ key, before: fmt(b[key]), after: fmt(a[key]), changed: fmt(b[key]) !== fmt(a[key]) }))
    .sort((x, y) => Number(y.changed) - Number(x.changed));
}

export function JsonDiff({ before, after, showUnchanged = false }: { before: unknown; after: unknown; showUnchanged?: boolean }) {
  const rows = diffEntries(before, after).filter((r) => showUnchanged || r.changed || before == null || after == null);
  if (rows.length === 0) return <p className="text-xs text-ink-muted">No field changes recorded.</p>;
  const hasBefore = before != null;
  const hasAfter = after != null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-xs">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1 pr-2 font-bold">Field</th>
            {hasBefore && <th className="py-1 pr-2 font-bold">Before</th>}
            {hasAfter && <th className="py-1 font-bold">After</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} className={r.changed ? "" : "text-ink-faint"}>
              <th scope="row" className="py-1 pr-2 text-left align-top font-mono font-semibold whitespace-nowrap">
                {r.key}
              </th>
              {hasBefore && <td className={`max-w-64 py-1 pr-2 align-top font-mono break-all ${r.changed ? "bg-live-soft/60" : ""}`}>{r.before}</td>}
              {hasAfter && <td className={`max-w-64 py-1 align-top font-mono break-all ${r.changed ? "bg-win/10" : ""}`}>{r.after}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
