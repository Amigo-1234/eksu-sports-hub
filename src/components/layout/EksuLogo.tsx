import Image from "next/image";
import logo from "../../../public/brand/eksu-university-logo.png";

/**
 * Official Ekiti State University logo (crest + wordmark), shown unaltered at
 * its native aspect ratio (width is always auto). Its wordmark is burgundy and
 * green, so on the dark public theme it sits on a white plate (`plate`) —
 * never recoloured or redrawn.
 *
 * `height` sets a fixed pixel height; `heightClass` sets a responsive one
 * (e.g. "h-[38px] md:h-[44px]") instead.
 */
export function EksuLogo({
  height = 36,
  heightClass,
  priority = false,
  plate = false,
}: {
  height?: number;
  heightClass?: string;
  priority?: boolean;
  /** Wrap in a white plate so the artwork reads on dark surfaces. */
  plate?: boolean;
}) {
  const img = (
    <Image
      src={logo}
      alt="Ekiti State University"
      priority={priority}
      // Largest rendered width (44px tall on desktop) — lets Next pick a crisp source.
      sizes="140px"
      className={heightClass ? `${heightClass} w-auto` : undefined}
      style={heightClass ? undefined : { width: "auto", height }}
    />
  );
  if (!plate) return img;
  return <span className="inline-flex shrink-0 items-center rounded-[5px] bg-white px-1.5 py-[3px]">{img}</span>;
}
