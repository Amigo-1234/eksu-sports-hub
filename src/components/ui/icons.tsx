import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </svg>
);

export const LiveIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
    <path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </svg>
);

export const CalendarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const ResultsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="m8 12.5 2.5 2.5L16 9.5" />
  </svg>
);

export const TableIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 5h16M4 10h16M4 15h16M4 20h16" />
    <path d="M8 5v15" />
  </svg>
);

export const TrophyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M16 5h3v2a3 3 0 0 1-3 3M8 5H5v2a3 3 0 0 0 3 3" />
    <path d="M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z" />
  </svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const MapPinIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const RefreshIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 0 0-14.7-4.3M4 5v4h4" />
    <path d="M4 13a8 8 0 0 0 14.7 4.3M20 19v-4h-4" />
  </svg>
);

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </svg>
);

export const WhistleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="14" r="5" />
    <path d="M13 11.5 21 8V5h-9.5L9 9" />
  </svg>
);

export const ShirtIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z" />
  </svg>
);

export const ChartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const SwapIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" />
  </svg>
);

/** Football for goal events (a simple geometric ball, not an emoji). */
export const BallIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.6, ...p })}>
    <circle cx="12" cy="12" r="9" />
    <path d="m12 7.5 3.8 2.8-1.5 4.5H9.7l-1.5-4.5L12 7.5Z" fill="currentColor" />
    <path d="M12 3v4.5M15.8 10.3l4.8-1.6M14.3 14.8l2.9 4.1M9.7 14.8l-2.9 4.1M8.2 10.3 3.4 8.7" />
  </svg>
);

export const CardIcon = ({ color, ...p }: IconProps & { color: "yellow" | "red" }) => (
  <svg {...base({ ...p, stroke: "none" })}>
    <rect
      x="6.5"
      y="3.5"
      width="11"
      height="17"
      rx="1.8"
      transform="rotate(8 12 12)"
      className={color === "yellow" ? "fill-accent-400" : "fill-live"}
    />
  </svg>
);
