import { createECDH } from "node:crypto";

/*
 * Pure VAPID key checks (no I/O). Results are booleans only, so they can be
 * reported without ever exposing key material.
 */

const B64URL = /^[A-Za-z0-9_-]+$/;

export interface VapidValidation {
  publicLength87: boolean;
  privateLength43: boolean;
  publicBytes65: boolean;
  publicUncompressed: boolean;
  privateBytes32: boolean;
  pairMatches: boolean;
}

function bytes(v: string): Buffer | null {
  return B64URL.test(v) ? Buffer.from(v, "base64url") : null;
}

/** An uncompressed P-256 point in URL-safe base64: what browsers need as applicationServerKey. */
export function isValidVapidPublicKey(v: unknown): v is string {
  if (typeof v !== "string" || v.length !== 87) return false;
  const b = bytes(v);
  return b !== null && b.length === 65 && b[0] === 4;
}

export function validateVapidPair(publicKey: string, privateKey: string): VapidValidation {
  const pub = bytes(publicKey);
  const priv = bytes(privateKey);
  let pairMatches = false;
  try {
    if (pub && priv && priv.length === 32) {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(priv);
      pairMatches = ecdh.getPublicKey().equals(pub);
    }
  } catch {
    // reported as false
  }
  return {
    publicLength87: publicKey.length === 87,
    privateLength43: privateKey.length === 43,
    publicBytes65: pub?.length === 65,
    publicUncompressed: pub?.[0] === 4,
    privateBytes32: priv?.length === 32,
    pairMatches,
  };
}

export function vapidPairValid(v: VapidValidation): boolean {
  return Object.values(v).every(Boolean);
}
