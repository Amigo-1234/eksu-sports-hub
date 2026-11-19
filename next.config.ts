import type { NextConfig } from "next";

/** The public site's real address. */
const CANONICAL = "https://eksusportshub.com.ng";
/** Vercel's own production addresses for this app: pages there redirect to the real domain. */
const VERCEL_HOSTS = ["eksu-sports-hub-cn82.vercel.app", "eksu-sports-hub-foy2.vercel.app", "eksu-sports-hub.vercel.app"];

const nextConfig: NextConfig = {
  // Share cards read fonts and crests from disk at request time.
  outputFileTracingIncludes: {
    "/matches/[id]/card": ["./src/assets/fonts/**", "./public/crests/**", "./public/brand/eksu-crest-192.png"],
  },
  async redirects() {
    // Pages only: /api/* stays reachable on these hosts (the push-notification dispatcher
    // posts to it), and Next's own assets are never redirected. Preview deployments
    // (other *.vercel.app hosts) are unaffected.
    return VERCEL_HOSTS.map((host) => ({
      source: "/:path((?!api/|_next/).*)",
      has: [{ type: "host" as const, value: host }],
      destination: `${CANONICAL}/:path`,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        // The push service worker must never be served stale, and may only load same-origin code.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
