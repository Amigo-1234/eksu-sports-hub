import Image from "next/image";
import logo from "../../../public/brand/eksu-university-logo.png";

/**
 * Official Ekiti State University logo (crest + wordmark). The artwork has a
 * white background, so it must sit on a white/light surface.
 */
export function EksuLogo({ height = 36, priority = false }: { height?: number; priority?: boolean }) {
  return (
    <Image
      src={logo}
      alt="Ekiti State University"
      height={height}
      style={{ width: "auto", height }}
      priority={priority}
    />
  );
}
