/** Compact EKSU Sports mark for the app header and icons. */
export function EksuMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="fill-accent-500" />
      <path
        d="M9 8.5h13v3.6h-8.8v2.2h7.6v3.4h-7.6v2.2H23v3.6H9V8.5Z"
        className="fill-brand-800"
      />
    </svg>
  );
}
