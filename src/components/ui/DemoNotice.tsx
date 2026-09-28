import { DATA_SOURCE_KIND } from "@/lib/data";

/** Honest labelling while the app runs on demo data. */
export function DemoNotice() {
  if (DATA_SOURCE_KIND !== "mock") return null;
  return (
    <p className="mt-8 rounded-lg border border-line bg-surface px-3 py-2.5 text-center text-xs text-ink-faint">
      <strong className="font-semibold text-ink-muted">Preview build.</strong> Teams and scores
      are demo data, and scores don&apos;t update automatically yet — reload the page for the latest.
    </p>
  );
}
