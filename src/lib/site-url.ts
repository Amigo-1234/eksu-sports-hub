import "server-only";
import { headers } from "next/headers";

/** Absolute origin of this site (NEXT_PUBLIC_SITE_URL, else the request host), for shareable links. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "eksusportshub.com.ng";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const welcomePath = (teamId: string) => `/teams/${teamId}/welcome`;
