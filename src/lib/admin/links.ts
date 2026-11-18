import "server-only";
import { headers } from "next/headers";
import { Invalid } from "./actions/util";

/** Absolute origin of this deployment, for one-time links. */
export async function siteOriginForLinks(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Invalid("Could not determine this site's address for the link.");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function confirmUrl(base: string, tokenHash: string, type: "invite" | "recovery") {
  const u = new URL("/auth/confirm", base);
  u.searchParams.set("token_hash", tokenHash);
  u.searchParams.set("type", type);
  return u.toString();
}
