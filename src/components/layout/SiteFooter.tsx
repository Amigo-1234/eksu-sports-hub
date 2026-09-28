import { EksuMark } from "./EksuMark";

export function SiteFooter() {
  return (
    <footer className="hidden border-t border-line bg-surface md:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 text-xs text-ink-faint">
        <p className="flex items-center gap-2">
          <EksuMark size={20} />
          <span>EKSU Sports Hub · Ekiti State University, Ado-Ekiti</span>
        </p>
        <p>All times are West Africa Time (WAT).</p>
      </div>
    </footer>
  );
}
