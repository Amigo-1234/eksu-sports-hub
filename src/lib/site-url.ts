import "server-only";
import { headers } from "next/headers";

export const CANONICAL_ORIGIN = "https://eksusportshub.com.ng";

/** Absolute origin of this site (NEXT_PUBLIC_SITE_URL, else the request host), for shareable links. */
export async function siteOrigin(): Promise<string> {
  // Production: always share the real domain, never a *.vercel.app address
  // (this wins over NEXT_PUBLIC_SITE_URL, which may still point at Vercel).
  if (process.env.VERCEL_ENV === "production") return CANONICAL_ORIGIN;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured && !configured.endsWith(".vercel.app")) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "eksusportshub.com.ng";
  if (host.endsWith("eksusportshub.com.ng")) return CANONICAL_ORIGIN;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const welcomePath = (teamId: string) => `/teams/${teamId}/welcome`;
