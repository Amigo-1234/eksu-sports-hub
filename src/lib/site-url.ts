import "server-only";
import { headers } from "next/headers";

/**
 * The live production deployment (not a preview or local build). Vercel sets
 * VERCEL_ENV; on Netlify set DEPLOY_ENV=production for the production context.
 */
export const isProductionDeploy = () => process.env.VERCEL_ENV === "production" || process.env.DEPLOY_ENV === "production";

export const CANONICAL_ORIGIN = "https://eksusportshub.com.ng";

/** Absolute origin of this site (NEXT_PUBLIC_SITE_URL, else the request host), for shareable links. */
export async function siteOrigin(): Promise<string> {
  // Production: always share the real domain, never a host's own address
  // (*.vercel.app / *.netlify.app); this wins over NEXT_PUBLIC_SITE_URL.
  if (isProductionDeploy()) return CANONICAL_ORIGIN;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured && !/\.(vercel|netlify)\.app$/.test(configured)) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "eksusportshub.com.ng";
  if (host.endsWith("eksusportshub.com.ng")) return CANONICAL_ORIGIN;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const welcomePath = (teamId: string) => `/teams/${teamId}/welcome`;
